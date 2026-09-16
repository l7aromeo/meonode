'use client'
import { createContext, createElement, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { Children, ResolvedThemeSystem, Theme, ThemeMode, ThemeModePreference, ThemeSystemModes } from '@src/types/node.type.js'
import { Node } from '@src/core.node.js'
import { buildThemeVariablesCss } from '@src/util/server-theme.util.js'

export interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme | ((theme: Theme) => Theme)) => void
  /** The mode in force, already resolved — never `'system'`. */
  mode: ThemeMode
  /** What the reader chose. `'system'` when they asked to follow the OS. */
  preference: ThemeModePreference
  /** Choose a mode outright, which also stops following the OS. */
  setMode: (mode: ThemeMode) => void
  /** Choose a mode or `'system'`; `'system'` is refused unless a mapping was given. */
  setPreference: (preference: ThemeModePreference) => void

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
 * Props for the original path.
 *
 * Both shapes are surfaced through one optional-member interface rather than a
 * union, because `createNode` infers a component's props and a union collapses
 * to `never` there — every existing `ThemeProvider({ theme })` call site stops
 * compiling. So the choice between the two is checked where it can be, at
 * runtime, with a message naming what is missing.
 */
export interface ThemeProviderProps {
  theme?: Theme
  tokens?: ResolvedThemeSystem
  modes?: readonly ThemeMode[]
  defaultMode?: ThemeMode
  system?: ThemeSystemModes
  storageKey?: string
  children?: Children
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
 * @returns The children with the variable block prepended, as a flat list.
 */
function composeChildren(children: Children | undefined, system: Theme['system']): Children {
  const themeVariablesCss = buildThemeVariablesCss({ mode: 'light' as Theme['mode'], system })
  if (!themeVariablesCss) return children
  const themeVariablesStyle = createElement('style', { 'data-meonode-theme-vars': '', children: themeVariablesCss })
  // Prepend the style rather than nesting an array inside `children`, so the
  // shape stays a flat `Children` list.
  return [themeVariablesStyle, ...(Array.isArray(children) ? children : children == null ? [] : [children])] as Children
}

function LegacyThemeProvider({ children, theme }: { children?: Children; theme: Theme }): ReactNode {
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
    // Present so a consumer can read the same names on either path. There is no
    // separate preference here: the theme object *is* the choice, and the hook
    // keeps writing the DOM as it always has.
    mode: currentTheme.mode as ThemeMode,
    preference: currentTheme.mode as ThemeModePreference,
    setMode: mode => applyTheme({ ...currentTheme, mode: mode as Theme['mode'] }),
    setPreference: preference => applyTheme({ ...currentTheme, mode: preference as Theme['mode'] }),
  }

  return Node(ThemeContext.Provider, { value: contextValue, children: composeChildren(children, currentTheme.system) }).render()
}

/**
 * The mode-aware path.
 *
 * The document does not depend on the mode: the `:root` block is built from
 * `tokens` alone, and which palette applies is decided by `data-theme` on the
 * document element, written before the first paint by a blocking script. So this
 * component seeds from that attribute rather than from storage — by the time
 * React runs, the attribute already holds the answer storage would have given,
 * and reading the DOM cannot disagree with what the reader is looking at.
 */
function ModeThemeProvider({ children, tokens, modes, defaultMode, system, storageKey = 'theme' }: ThemeModesProviderProps): ReactNode {
  const canFollowSystem = system !== undefined

  const [preference, setPreferenceState] = useState<ThemeModePreference>(() => {
    const stored = readStored(storageKey)
    if (stored === 'system') return canFollowSystem ? 'system' : defaultMode
    if (stored && modes.includes(stored)) return stored
    return defaultMode
  })

  const resolveSystemMode = useCallback((): ThemeMode => {
    if (!system) return defaultMode
    try {
      return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? system.dark : system.light
    } catch {
      return system.light
    }
  }, [defaultMode, system])

  const [mode, setModeState] = useState<ThemeMode>(() => {
    // The attribute is the pre-paint answer. Trust it when it names a declared
    // mode; fall back only when nothing has written one yet, as in SSR.
    const stamped = globalThis.document?.documentElement?.getAttribute('data-theme')
    if (stamped && modes.includes(stamped)) return stamped
    if (preference === 'system') return resolveSystemMode()
    return preference === 'system' ? defaultMode : preference
  })

  // Only a change moves the attribute. Writing it on every render is what let a
  // provider sitting on its default overwrite a choice a consumer had made.
  const lastWritten = useRef<ThemeMode | null>(null)
  const applyMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    if (lastWritten.current === next) return
    lastWritten.current = next
    globalThis.document?.documentElement?.setAttribute('data-theme', next)
  }, [])

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
      if (next === 'system' && !canFollowSystem) return
      setPreferenceState(next)
      writeStored(storageKey, next)
      applyMode(next === 'system' ? resolveSystemMode() : next)
    },
    [applyMode, canFollowSystem, resolveSystemMode, storageKey],
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
    modes,
  }

  return Node(ThemeContext.Provider, { value: contextValue, children: composeChildren(children, tokens) }).render()
}

/**
 * Provides a theme.
 *
 * Two shapes, and which one an application passes decides how much of the
 * document depends on the reader. `theme` is the original: one theme object,
 * swapped wholesale, with the hook writing `data-theme` and the light/dark
 * classes. `tokens` + `modes` is the cacheable path described on
 * {@link ThemeModesProviderProps}.
 * @param props Either `{ theme }` or the mode-aware set.
 * @returns The provider, with its `:root` variable block.
 */
export default function ThemeProvider(props: ThemeProviderProps): ReactNode {
  if (props.tokens !== undefined) {
    if (!props.modes?.length || !props.defaultMode) {
      throw new Error('`tokens` needs `modes` and `defaultMode`: the mode names cannot be inferred from a token map')
    }
    // Rendered as elements rather than called, so each path is its own fiber and
    // neither can inherit the other's hook order.
    return createElement(ModeThemeProvider, props as ThemeModesProviderProps)
  }
  if (!props.theme) {
    throw new Error('`theme` prop must be defined')
  }
  return createElement(LegacyThemeProvider, props as { children?: Children; theme: Theme })
}

;(ThemeProvider as { __meonodeAcceptsServerCss?: boolean }).__meonodeAcceptsServerCss = true
;(ThemeProvider as { __meonodeProvidesServerTheme?: boolean }).__meonodeProvidesServerTheme = true
