'use client'
import { createContext, createElement, type ReactNode, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { Children, ResolvedThemeMode, ResolvedThemePreference, ResolvedThemeSystem, Theme, ThemeSystemModes } from '@src/types/node.type.js'
import { Node } from '@src/core.node.js'
import { buildThemeVariablesCss } from '@src/util/server-theme.util.js'
import { diagnosticsEnabled } from '@src/util/theme-diagnostics.util.js'

export interface ThemeContextValue {
  /**
   * The resolved theme, as the styled renderer consumes it: the mode in force
   * and the token map.
   *
   * Read-only. There is no `setTheme`: a theme object cannot be swapped here,
   * because the palettes are CSS keyed by `[data-theme="…"]` and the document
   * only ever carries token references. `setMode` names a mode instead.
   */
  theme: Theme
  /** The mode in force, already resolved — never `'system'`. */
  mode: ResolvedThemeMode

  /**
   * What the reader chose. `'system'` when they asked to follow the OS.
   *
   * `'system'` when the reader asked to follow the OS, so a three-way control
   * can show the position they chose rather than the one it resolved to.
   */
  preference?: ResolvedThemePreference

  /**
   * Choose a mode outright, which also stops following the OS.
   */
  setMode: (mode: ResolvedThemeMode) => void

  /**
   * Choose a mode or `'system'`; `'system'` is refused unless a mapping was given.
   */
  setPreference: (preference: ResolvedThemePreference) => void

  /**
   * False until the provider has adopted the reader's real mode.
   *
   * The first client render must match the server's, so it renders the default
   * whatever the reader stored. A consumer rendering markup from `mode` — a
   * toggle position, a different icon — can gate on this to avoid showing the
   * default for one commit.
   *
   * Page-level theming does not need it: CSS keyed off `[data-theme="…"]` is
   * correct from the first painted frame, because the pre-paint script sets the
   * attribute before anything renders. This is for markup React owns.
   */
  hydrated: boolean

  /** The mode names this site declared, as given to the provider. */
  modes: readonly ResolvedThemeMode[]
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

/**
 * Props for the theme provider.
 *
 * One token map plus the mode names a site declares. Values in `tokens` are
 * `var(--…)` references whose palettes live in CSS keyed by `[data-theme="…"]`,
 * which is what lets the server render one document for every reader: the markup
 * does not depend on the mode, so it cannot vary with it.
 *
 * Flat rather than a union of two prop shapes. `createNode` infers a component's
 * props and a union collapses to `never` there, which is what made an
 * either/or API need two components; a single interface keeps every required
 * prop required.
 */
export interface ThemeProviderProps {
  tokens: ResolvedThemeSystem

  /** Every mode this site has. `[data-theme="…"]` takes one of these names. */
  modes: readonly ResolvedThemeMode[]

  /**
   * The terminal fallback: what applies when storage is blocked, `matchMedia`
   * throws, or a stored mode is no longer declared.
   *
   * Required and explicit rather than `modes[0]`, because an implicit default
   * makes reordering an array a behaviour change and nothing in review shows it.
   */
  defaultMode: ResolvedThemeMode

  /**
   * What a reader who has never chosen starts on. Defaults to `defaultMode`.
   *
   * Separate from `defaultMode` because the mode cannot express it:
   * `defaultMode: 'night'` says "dark when nothing is stored", while
   * `defaultPreference: 'system'` says "follow the OS until told otherwise".
   *
   * `'system'` requires the `system` mapping and throws without it — unlike a
   * stored* `'system'` with no mapping, which is a reader's leftover and
   * degrades quietly.
   */
  defaultPreference?: ResolvedThemePreference

  /** Maps `prefers-color-scheme` onto two of `modes`. Without it, `'system'` is not offered. */
  system?: ThemeSystemModes

  /** Where the preference is kept. Defaults to `theme`. */
  storageKey?: string

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

/**
 * The value, if it is one of the modes this site declared.
 *
 * Storage and the DOM hand back `string`; `modes` is the runtime proof of which
 * strings are real, and a site that augments `MeoTheme['mode']` types them as a
 * union. `includes` cannot narrow a `string` to that union on its own, so the
 * membership test is the check and the cast states what it established.
 */
function asDeclaredMode(value: string | null | undefined, modes: readonly ResolvedThemeMode[]): ResolvedThemeMode | undefined {
  return value != null && (modes as readonly string[]).includes(value) ? (value as ResolvedThemeMode) : undefined
}

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

export default function ThemeProvider({
  children,
  tokens,
  modes,
  defaultMode,
  defaultPreference,
  system,
  storageKey = 'theme',
}: ThemeProviderProps): ReactNode {
  // Checked at construction, ungated, and named.
  //
  // These are required props, so a typechecked caller cannot omit one. A
  // sandbox, a JavaScript consumer, a CDN-cached bundle and a stale copy of a
  // sample are all callers TypeScript never sees, and for them the first symptom
  // was `Cannot read properties of undefined (reading 'includes')` thrown from a
  // minified helper inside React's commit phase — and only for readers who had
  // already chosen a theme, since with nothing stored the expression
  // short-circuited before it touched `modes`.
  //
  // Not behind `diagnosticsEnabled`: a missing required prop is not a
  // development-only concern when the caller was never typechecked. The same
  // reasoning `themeScript` already applies to its own configuration.
  if (tokens === undefined) {
    throw new Error('ThemeProvider: `tokens` is missing. It is the token map this theme resolves `theme.*` strings against.')
  }
  if (!Array.isArray(modes) || modes.length === 0) {
    throw new Error("ThemeProvider: `modes` is missing. It lists the mode names this application declares, for example `modes: ['light', 'dark']`.")
  }
  if (defaultMode === undefined) {
    throw new Error('ThemeProvider: `defaultMode` is missing. It is the mode that applies when nothing is stored and the OS cannot be consulted.')
  }
  if (!modes.includes(defaultMode)) {
    throw new Error(`ThemeProvider: \`defaultMode\` is '${String(defaultMode)}', which is not one of \`modes\` (${modes.join(', ')}).`)
  }

  const canFollowSystem = system !== undefined

  if (defaultPreference === 'system' && !canFollowSystem) {
    throw new Error("ThemeProvider: `defaultPreference` is 'system', which needs a `system` mapping saying which of your modes the OS words mean, e.g. system: { light: '…', dark: '…' }")
  }
  if (defaultPreference !== undefined && defaultPreference !== 'system' && !modes.includes(defaultPreference)) {
    throw new Error(`ThemeProvider: \`defaultPreference\` is '${String(defaultPreference)}', which is not one of \`modes\` (${modes.join(', ')}) nor 'system'.`)
  }

  // Seeded once, like the theme path above: `defaultMode` is the initial mode,
  // not a controlled prop, and passing a different one later changes nothing.
  // `tokens` is not state and does flow through on every render, so the variable
  // block follows it.
  //
  // Both pieces of state start at the default and are adopted after mount. No
  // `document` and no `localStorage` during render — see the note on the
  // component.
  // A prop, so both renders agree on it without reading anything the server
  // cannot see.
  const [preference, setPreferenceState] = useState<ResolvedThemePreference>(defaultPreference ?? defaultMode)
  const [hydrated, setHydrated] = useState(false)

  const resolveSystemMode = useCallback((): ResolvedThemeMode => {
    if (!system) return defaultMode
    try {
      return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? system.dark : system.light
    } catch {
      return system.light
    }
  }, [defaultMode, system])

  const [mode, setModeState] = useState<ResolvedThemeMode>(defaultMode)

  /** Assert both attributes from the values given. No cache, no comparison. */
  const writeAttributes = useCallback((nextMode: ResolvedThemeMode, nextPreference: ResolvedThemePreference) => {
    const element = globalThis.document?.documentElement
    if (!element) return
    element.setAttribute('data-theme', nextMode)
    // Not the same value as the mode: `system` stays `system` here, so a
    // three-way control can show the position the reader chose rather than the
    // one it resolved to.
    element.setAttribute('data-theme-preference', nextPreference)
  }, [])

  const applyMode = useCallback((next: ResolvedThemeMode) => setModeState(next), [])

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

    const declaredStored = asDeclaredMode(stored, modes)
    const declaredStamped = asDeclaredMode(stamped, modes)

    const fallbackPreference: ResolvedThemePreference = defaultPreference ?? defaultMode
    const nextPreference: ResolvedThemePreference =
      stored === 'system' && canFollowSystem
        ? 'system'
        : (declaredStored ??
          // Nothing stored: the application's own default outranks the
          // attribute, since the attribute is the script's rendering of that
          // same default.
          (fallbackPreference === 'system' ? 'system' : (declaredStamped ?? fallbackPreference)))

    const nextMode: ResolvedThemeMode = nextPreference === 'system' ? (declaredStamped ?? resolveSystemMode()) : (declaredStamped ?? nextPreference)

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
    (next: ResolvedThemePreference) => {
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

  const setMode = useCallback((next: ResolvedThemeMode) => setPreference(next), [setPreference])

  const theme: Theme = { mode: mode as Theme['mode'], system: tokens }

  const contextValue: ThemeContextValue = {
    theme,
    mode,
    preference,
    setMode,
    setPreference,
    hydrated,
    modes,
  }

  return Node(ThemeContext.Provider, { value: contextValue, children: composeChildren(children, tokens, mode as Theme['mode']) }).render()
}

// The mode path carries the same two flags. `providesServerTheme` reads
// `rawProps.theme`, which this path does not have, and that is harmless:
// server-side `theme.*` resolution and media-query keys both come out identical
// either way — measured on both paths through `renderToString`.
;(ThemeProvider as { __meonodeAcceptsServerCss?: boolean }).__meonodeAcceptsServerCss = true
;(ThemeProvider as { __meonodeProvidesServerTheme?: boolean }).__meonodeProvidesServerTheme = true
