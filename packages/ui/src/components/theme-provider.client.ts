'use client'
import { createContext, createElement, type ReactNode, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { Children, ResolvedThemeSystem, Theme, ThemeMode, ThemeModePreference, ThemeSystemModes } from '@src/types/node.type.js'
import { Node } from '@src/core.node.js'
import { buildThemeVariablesCss } from '@src/util/server-theme.util.js'
import { diagnosticsEnabled } from '@src/util/theme-diagnostics.util.js'

export interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme | ((theme: Theme) => Theme)) => void
  /** The mode in force, already resolved — never `'system'`. */
  mode: ThemeMode

  /**
   * What the reader chose. `'system'` when they asked to follow the OS.
   *
   * Absent on `ThemeProvider`, which has no preference concept — the theme
   * object is the choice there.
   */
  preference?: ThemeModePreference

  /**
   * Choose a mode outright, which also stops following the OS.
   *
   * Throws on `ThemeProvider`: a mode is not separable from the theme there.
   */
  setMode: (mode: ThemeMode) => void

  /**
   * Choose a mode or `'system'`; `'system'` is refused unless a mapping was given.
   *
   * Throws on `ThemeProvider`, which stores no preference.
   */
  setPreference: (preference: ThemeModePreference) => void

  /**
   * False until the provider has adopted the reader's real mode.
   *
   * The first client render must match the server's, so it renders the default
   * whatever the reader stored. A consumer rendering markup from `mode` — a
   * toggle position, a different icon — can gate on this to avoid showing the
   * default for one commit. Always true on the original `theme` path, which has
   * nothing to adopt.
   */
  hydrated: boolean

  /**
   * The declared mode names, and the marker that this is the mode-aware path.
   * `useTheme` reads it to decide whether it owns the DOM write — on the legacy
   * path it does, and consumers depend on that; here the provider does, once,
   * and only when something actually changes.
   */
  modes?: readonly ThemeMode[]
}

/**
 * Props for the mode-aware path.
 *
 * One token map plus a list of mode names, rather than a theme per mode, because
 * the cacheable property has to hold by construction: with a single map the
 * emitted `:root` block is the same whatever the reader stored, so the server's
 * bytes cannot vary. A record of full themes would let an application put the
 * per-reader variation straight back.
 *
 * Token values are expected to be `var(--…)` references whose palettes live in
 * CSS keyed by `[data-theme="…"]`, which is what makes one document correct for
 * every reader.
 */
export interface ThemeModesProviderProps {
  tokens: ResolvedThemeSystem
  modes: readonly ThemeMode[]
  defaultMode: ThemeMode
  /** Maps `prefers-color-scheme` onto two of `modes`. Without it, `'system'` is not offered. */
  system?: ThemeSystemModes
  /** Where the preference is kept. Defaults to `theme`. */
  storageKey?: string
  children?: Children
}

/**
 * Props for the original path: one theme object, swapped wholesale.
 *
 * Separate from {@link ThemeModesProviderProps} rather than a union of the two,
 * because `createNode` infers a component's props and a union collapses to
 * `never` there — every existing call site would stop compiling. Two components
 * keep each set required where it belongs, so a missing prop is a compile error
 * rather than a throw.
 */
export interface ThemeProviderProps {
  theme: Theme
  children?: Children
}

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * A layout effect never runs during server rendering, and React warns when one
 * is present there. The provider needs layout timing on the client — adoption
 * has to land before paint — and needs to say nothing at all on the server.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Web Storage is absent in some runtimes and throws in others (private mode, disabled site data). */
function readStored(key: string): string | null {
  try {
    const storage = globalThis.localStorage
    if (!storage || typeof storage.getItem !== 'function') return null
    return storage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  try {
    const storage = globalThis.localStorage
    if (!storage || typeof storage.setItem !== 'function') return
    storage.setItem(key, value)
  } catch {
    /* a reader who has blocked storage still gets the mode they clicked, for this page */
  }
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * The internal implementation of the ThemeProvider component.
 * @param {object} props The props for the component.
 * @param {Children} [props.children] The children to render.
 * @param {Theme} props.theme The theme to provide.
 * @returns {ReactNode} The rendered component.
 */

/**
 * Emits the `:root{--meonode-theme-*}` block as part of the provider's own
 * output, rather than registering it into module-global state for
 * `StyleRegistry` to consume at a streaming flush point. That indirection made
 * emission depend on whether registration happened before the final flush — on
 * some routes it silently didn't, leaving hundreds of `var(...)` references
 * pointing at properties that were never defined server-side. It also shared one
 * process-global map across concurrent SSR requests, and keyed the rule on a
 * constant id, so a second (or nested) theme was consumed and then dropped.
 *
 * Rendering it here fixes all of that: emission is a pure function of the tokens,
 * so it cannot depend on render order or another component's timing; it is
 * request-scoped by construction; and a nested provider emits its own block.
 *
 * Deliberately a plain `<style>` — *not* React's hoisted
 * `<style href precedence>` resource. A hoisted style is keyed by `href` and
 * reused in its original document position, so switching theme A -> B -> A
 * leaves B's tag *after* A's and B keeps winning the cascade, applying the wrong
 * theme. A plain element is owned by this component: React rewrites its text on
 * theme change, and removes it on unmount. CSS is document-global, so `:root`
 * applies regardless of where the tag sits.
 *
 * On the mode-aware path this is also where the cacheable property is decided:
 * the block is a function of the tokens alone, so it does not move when the mode
 * does.
 * @param children The provider's own children.
 * @param system The token map to emit.
 * @param mode The mode in force, for the day the block depends on it.
 * @returns The children with the variable block prepended, as a flat list.
 */
function composeChildren(children: Children | undefined, system: Theme['system'], mode: Theme['mode']): Children {
  // `mode` is passed through rather than filled in with a literal. It is unused
  // by `buildThemeVariablesCss` today, which reads `system` alone — that is what
  // makes the block a pure function of the tokens, and so what makes the mode
  // path cacheable. Handing it a real mode anyway costs nothing and means the
  // day that stops being true, this does not silently emit one mode's variables
  // for every reader.
  const themeVariablesCss = buildThemeVariablesCss({ mode, system })
  if (!themeVariablesCss) return children
  const themeVariablesStyle = createElement('style', { 'data-meonode-theme-vars': '', children: themeVariablesCss })
  // Prepend the style rather than nesting an array inside `children`, so the
  // shape stays a flat `Children` list.
  return [themeVariablesStyle, ...(Array.isArray(children) ? children : children == null ? [] : [children])] as Children
}

export default function ThemeProvider({ children, theme }: ThemeProviderProps): ReactNode {
  // Seeded once. `theme` is the *initial* theme, not a controlled prop: passing a
  // different one on a later render changes nothing, because that is what a
  // `useState` initialiser does. Swapping the theme goes through `setTheme`.
  //
  // Long-standing behaviour, and surprising enough to be worth the line — an
  // application that re-renders this with a new `theme` sees its prop ignored
  // with nothing said about it.
  const [currentTheme, setTheme] = useState<Theme>(theme)

  if (!theme) {
    throw new Error('`theme` prop must be defined')
  }

  const applyTheme = (next: Theme | ((theme: Theme) => Theme)) => {
    const resolved = typeof next === 'function' ? next(currentTheme) : next
    document.cookie = `theme=${resolved.mode}; path=/;`
    setTheme(resolved)
  }

  const contextValue: ThemeContextValue = {
    theme: currentTheme,
    setTheme: applyTheme,
    // `mode` is genuinely this theme's own, so a consumer can read the same name
    // on either path. Nothing is adopted after mount here, so `hydrated` is true
    // from the start.
    mode: currentTheme.mode as ThemeMode,
    hydrated: true,
    // The other three belong to the mode path and cannot be honoured here.
    // Changing `mode` while keeping `system` is not a mode switch on this path:
    // the palettes are different objects with different values, so it would
    // produce a theme claiming one mode while emitting the other's variables,
    // and the hook would then stamp the attribute over the top. Swapping a whole
    // theme is what `setTheme` is for.
    setMode: () => {
      throw new Error('setMode is not available on ThemeProvider: swap the theme with setTheme, or use ThemeModesProvider for named modes')
    },
    setPreference: () => {
      throw new Error('setPreference is not available on ThemeProvider: there is no preference to store here — use ThemeModesProvider')
    },
    // `preference` is left undefined rather than echoing the mode: this path has
    // no preference concept, and reporting one would be a fabrication.
  }

  return Node(ThemeContext.Provider, { value: contextValue, children: composeChildren(children, currentTheme.system, currentTheme.mode) }).render()
}

/**
 * The mode-aware path.
 *
 * The document does not depend on the mode: the `:root` block is built from
 * `tokens` alone, and which palette applies is decided by `data-theme` on the
 * document element, written before the first paint by a blocking script. So this
 * component renders `defaultMode` on its first pass — on the server and on the
 * client alike — and adopts the reader's real mode in a layout effect.
 *
 * It cannot read the attribute or storage while rendering. Both are absent on
 * the server and present on the client, so doing so makes the two first renders
 * differ for every reader whose mode is not the default. React requires them to
 * be identical: a consumer rendering anything from `mode` — a toggle's
 * `checked`, a different icon, an offset — then throws #418, React discards the
 * server tree and client-renders the document, and that reset is what wipes the
 * attributes the script wrote. The attribute loss is the symptom of the
 * mismatch, not a separate fault.
 *
 * The page itself does not flash, because page-level theming is CSS keyed off
 * the attribute the script already wrote before the first paint. Only React
 * markup that depends on `mode` takes a second pass, which is the price of that
 * markup being React's rather than CSS's. `hydrated` is on the context so a
 * consumer can gate that deliberately.
 */
export function ThemeModesProvider({ children, tokens, modes, defaultMode, system, storageKey = 'theme' }: ThemeModesProviderProps): ReactNode {
  const canFollowSystem = system !== undefined

  // Seeded once, like the theme path above: `defaultMode` is the initial mode,
  // not a controlled prop, and passing a different one later changes nothing.
  // `tokens` is not state and does flow through on every render, so the variable
  // block follows it.
  //
  // Both pieces of state start at the default and are adopted after mount. No
  // `document` and no `localStorage` during render — see the note on the
  // component.
  const [preference, setPreferenceState] = useState<ThemeModePreference>(defaultMode)
  const [hydrated, setHydrated] = useState(false)

  const resolveSystemMode = useCallback((): ThemeMode => {
    if (!system) return defaultMode
    try {
      return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? system.dark : system.light
    } catch {
      return system.light
    }
  }, [defaultMode, system])

  const [mode, setModeState] = useState<ThemeMode>(defaultMode)

  /** Assert both attributes from the values given. No cache, no comparison. */
  const writeAttributes = useCallback((nextMode: ThemeMode, nextPreference: ThemeModePreference) => {
    const element = globalThis.document?.documentElement
    if (!element) return
    element.setAttribute('data-theme', nextMode)
    // Not the same value as the mode: `system` stays `system` here, so a
    // three-way control can show the position the reader chose rather than the
    // one it resolved to.
    element.setAttribute('data-theme-preference', nextPreference)
  }, [])

  const applyMode = useCallback((next: ThemeMode) => setModeState(next), [])

  // Adoption, in a layout effect so it lands in the same commit as hydration and
  // before anything paints — a passive effect would leave a frame showing the
  // default.
  //
  // The attribute is preferred over raw storage because the script has already
  // validated it against `modes` and resolved `system` against the OS; storage
  // is the fallback for a reader whose attribute did not survive, and it is
  // validated here instead.
  useIsomorphicLayoutEffect(() => {
    const stamped = globalThis.document?.documentElement?.getAttribute('data-theme')
    const stored = readStored(storageKey)

    const nextPreference: ThemeModePreference =
      stored === 'system' && canFollowSystem ? 'system' : stored && modes.includes(stored) ? stored : stamped && modes.includes(stamped) ? stamped : defaultMode

    const nextMode: ThemeMode =
      nextPreference === 'system'
        ? stamped && modes.includes(stamped)
          ? stamped
          : resolveSystemMode()
        : stamped && modes.includes(stamped)
          ? stamped
          : nextPreference

    setPreferenceState(nextPreference)
    setModeState(nextMode)
    setHydrated(true)
    writeAttributes(nextMode, nextPreference)
    // Mount only: this is the handover from the pre-paint script, which happens
    // once. Everything after it goes through the setters.
  }, [])

  // Write-through: the document is asserted from state whenever the provider
  // renders, so anything that discards the attribute — a view transition, an
  // extension, a framework touching the root — is repaired on the next render
  // rather than leaving every `[data-theme=…]` selector unmatched.
  //
  // Gated on `hydrated` so it cannot run before adoption. Effects belong to the
  // render that scheduled them, and the mount render still holds the default:
  // without this gate, the passive effect from that render would write the
  // default *after* the layout effect had written the reader's real mode.
  useEffect(() => {
    if (!hydrated) return
    writeAttributes(mode, preference)
  })

  useEffect(() => {
    if (preference !== 'system' || !system) return
    let media: MediaQueryList | undefined
    try {
      media = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
    } catch {
      return
    }
    if (!media?.addEventListener) return
    const onChange = (event: MediaQueryListEvent) => applyMode(event.matches ? system.dark : system.light)
    media.addEventListener('change', onChange)
    return () => media?.removeEventListener('change', onChange)
  }, [applyMode, preference, system])

  const setPreference = useCallback(
    (next: ThemeModePreference) => {
      // `prefers-color-scheme` says `dark` or `light`, which are the OS's words.
      // Without a mapping there is nothing to translate them into, and guessing
      // that one of the app's modes means "dark" is how a `'sepia'` ends up
      // treated as light.
      if (next === 'system' && !canFollowSystem) {
        if (diagnosticsEnabled()) {
          console.warn(
            "[MeoNode] ThemeProvider: 'system' was requested but no `system` mapping was given, so there is nothing to resolve it to. " +
              "Pass `system: { light: '<mode>', dark: '<mode>' }` to say which of your modes the OS words mean.",
          )
        }
        return
      }
      // A mode that was never declared would set `data-theme` to a value no
      // selector matches, which reads as the whole theme system having failed.
      if (next !== 'system' && !modes.includes(next)) {
        if (diagnosticsEnabled()) {
          console.warn(`[MeoNode] ThemeProvider: '${next}' is not one of the declared modes (${modes.join(', ')}), so it was ignored.`)
        }
        return
      }
      setPreferenceState(next)
      writeStored(storageKey, next)
      const nextMode = next === 'system' ? resolveSystemMode() : next
      applyMode(nextMode)
      // Directly as well as through the effect: choosing the mode already in
      // state is a no-op re-render, so the effect would not run — and that is
      // exactly the call someone makes when the document has lost the attribute
      // and the control looks stuck.
      writeAttributes(nextMode, next)
    },
    [applyMode, canFollowSystem, modes, resolveSystemMode, storageKey, writeAttributes],
  )

  const setMode = useCallback((next: ThemeMode) => setPreference(next), [setPreference])

  const theme: Theme = { mode: mode as Theme['mode'], system: tokens }

  const contextValue: ThemeContextValue = {
    theme,
    // Kept so a consumer written against the legacy hook still works. A whole
    // theme cannot be swapped here — that is the point of the path — so only the
    // mode it names is honoured.
    setTheme: next => {
      const resolved = typeof next === 'function' ? next(theme) : next
      setPreference(resolved.mode as ThemeMode)
    },
    mode,
    preference,
    setMode,
    setPreference,
    hydrated,
    modes,
  }

  return Node(ThemeContext.Provider, { value: contextValue, children: composeChildren(children, tokens, mode as Theme['mode']) }).render()
}

;(ThemeProvider as { __meonodeAcceptsServerCss?: boolean }).__meonodeAcceptsServerCss = true
;(ThemeProvider as { __meonodeProvidesServerTheme?: boolean }).__meonodeProvidesServerTheme = true
// The mode path carries the same two flags. `providesServerTheme` reads
// `rawProps.theme`, which this path does not have, and that is harmless:
// server-side `theme.*` resolution and media-query keys both come out identical
// either way — measured on both paths through `renderToString`.
;(ThemeModesProvider as { __meonodeAcceptsServerCss?: boolean }).__meonodeAcceptsServerCss = true
;(ThemeModesProvider as { __meonodeProvidesServerTheme?: boolean }).__meonodeProvidesServerTheme = true
