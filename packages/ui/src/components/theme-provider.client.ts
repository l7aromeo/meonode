'use client'
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useState,
  useSyncExternalStore,
} from 'react'
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
   * False while this reader shows the server's default rather than the reader's
   * real mode.
   *
   * A render that hydrates server markup must match the server's, so it renders
   * the default whatever the reader stored, and the reader's mode follows in the
   * same commit, before paint. A consumer rendering markup from `mode` — a toggle
   * position, a different icon — can gate on this. Where nothing was
   * server-rendered it is true from the first render.
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

/** What a reader of the theme sees at one moment: the mode, their choice, and whether it is theirs yet. */
export interface ThemeSnapshot {
  mode: ResolvedThemeMode
  preference: ResolvedThemePreference
  hydrated: boolean
}

/**
 * The reader's mode, held outside React state so that adopting it never changes
 * the provider's context value.
 *
 * Every Suspense boundary still dehydrated below a provider sits under its
 * context, and React discards such a boundary's server HTML and client-renders
 * it when that context changes before it has hydrated: at any priority while
 * the server is still streaming its content, and at anything but a transition
 * while hydrating it suspends on a chunk. Adoption happens as the provider
 * hydrates, which on a slow load is while such boundaries exist. So the context
 * carries this store, which never changes, and each reader subscribes to it:
 * a reader updates when it has hydrated itself, and nothing else re-renders.
 */
export interface ThemeStore {
  /** What the server rendered and what hydration must reproduce: the defaults. */
  getServerSnapshot: () => ThemeSnapshot
  /** The reader's own state, adopted from the document and storage the first time it is asked for. */
  getSnapshot: () => ThemeSnapshot
  subscribe: (listener: () => void) => () => void
  /** Replaces part of the adopted state and tells every reader. */
  update: (next: Partial<Omit<ThemeSnapshot, 'hydrated'>>) => void
}

function createThemeStore(serverSnapshot: ThemeSnapshot, adopt: () => ThemeSnapshot): ThemeStore {
  let adopted: ThemeSnapshot | undefined
  const listeners = new Set<() => void>()
  const getSnapshot = () => (adopted ??= adopt())
  return {
    getServerSnapshot: () => serverSnapshot,
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    update(next) {
      const current = getSnapshot()
      if ((next.mode ?? current.mode) === current.mode && (next.preference ?? current.preference) === current.preference) return
      adopted = { ...current, ...next }
      listeners.forEach(listener => listener())
    },
  }
}

/**
 * What the provider hands its readers. It changes only with the provider's own
 * props — never with the mode, which readers take from `store`.
 */
export interface ThemeContextState {
  store: ThemeStore

  /**
   * The token map, as the styled renderer consumes it. Its `mode` is the
   * default and does not follow the reader's: styles resolve tokens to
   * variables, and the palettes are CSS keyed by `[data-theme="…"]`.
   */
  theme: Theme
  modes: readonly ResolvedThemeMode[]
  setMode: (mode: ResolvedThemeMode) => void
  setPreference: (preference: ResolvedThemePreference) => void
}

export const ThemeContext = createContext<ThemeContextState | null>(null)

const subscribeToNothing = () => () => {}

/**
 * A value derived from the provider's store, read the way a hydrating reader
 * must: the server's snapshot while it hydrates, and its own once it has, taken
 * in the same commit, before paint. `useSyncExternalStore` alone would catch up
 * only in a passive effect, after a frame showing the server's value.
 *
 * Only the component calling it re-renders when the value changes.
 * @param store The provider's store, or `null` with no provider above.
 * @param select What to read from a snapshot, or `null` to read nothing and never re-render.
 * @param fallback The value when there is no store or nothing to read.
 * @returns The value.
 */
export function useThemeSnapshot<T>(store: ThemeStore | null, select: ((snapshot: ThemeSnapshot) => T) | null, fallback: T): T {
  const reads = store !== null && select !== null
  const getSnapshot = () => (reads ? select(store.getSnapshot()) : fallback)
  const getServerSnapshot = () => (reads ? select(store.getServerSnapshot()) : fallback)
  const value = useSyncExternalStore(reads ? store.subscribe : subscribeToNothing, getSnapshot, getServerSnapshot)
  const [, renderAgain] = useReducer((count: number) => count + 1, 0)
  useIsomorphicLayoutEffect(() => {
    if (getSnapshot() !== value) renderAgain()
  })
  return value
}

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
 * @param mode The default mode: the block must not depend on the reader's, which the server cannot know.
 * @returns The children with the variable block prepended, as a flat list.
 */
function composeChildren(children: Children | undefined, system: Theme['system'], mode: Theme['mode']): Children {
  // `buildThemeVariablesCss` reads `system` alone, so the block is a pure
  // function of the tokens — what lets the server send one document to every
  // reader. It is handed the default, the one mode the server and every render
  // agree on.
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
    throw new Error(
      "ThemeProvider: `defaultPreference` is 'system', which needs a `system` mapping saying which of your modes the OS words mean, e.g. system: { light: '…', dark: '…' }",
    )
  }
  if (defaultPreference !== undefined && defaultPreference !== 'system' && !modes.includes(defaultPreference)) {
    throw new Error(`ThemeProvider: \`defaultPreference\` is '${String(defaultPreference)}', which is not one of \`modes\` (${modes.join(', ')}) nor 'system'.`)
  }

  const resolveSystemMode = useCallback((): ResolvedThemeMode => {
    if (!system) return defaultMode
    try {
      return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? system.dark : system.light
    } catch {
      return system.light
    }
  }, [defaultMode, system])

  // Seeded once: `defaultMode` is the initial mode, not a controlled prop, and
  // passing a different one later changes nothing. `tokens` is not state and
  // does flow through on every render, so the variable block follows it.
  //
  // The server, and the first client render when it hydrates, show the
  // defaults: neither may read `document` or `localStorage`, since the server
  // cannot. The reader's own mode is adopted the first time the client asks for
  // it — during the first render of a client-only mount, where nothing has to
  // match, and after the fact when hydrating.
  const [store] = useState(() =>
    createThemeStore({ mode: defaultMode, preference: defaultPreference ?? defaultMode, hydrated: false }, () => {
      // The attribute is preferred over raw storage because the script has
      // already validated it against `modes` and resolved `system` against the
      // OS; storage is the fallback for a reader whose attribute did not
      // survive, and it is validated here instead.
      const stamped = globalThis.document?.documentElement?.getAttribute('data-theme')
      const stored = readStored(storageKey)

      const declaredStored = asDeclaredMode(stored, modes)
      const declaredStamped = asDeclaredMode(stamped, modes)

      const fallbackPreference: ResolvedThemePreference = defaultPreference ?? defaultMode
      const preference: ResolvedThemePreference =
        stored === 'system' && canFollowSystem
          ? 'system'
          : (declaredStored ??
            // Nothing stored: the application's own default outranks the
            // attribute, since the attribute is the script's rendering of that
            // same default.
            (fallbackPreference === 'system' ? 'system' : (declaredStamped ?? fallbackPreference)))

      const mode: ResolvedThemeMode = preference === 'system' ? (declaredStamped ?? resolveSystemMode()) : (declaredStamped ?? preference)
      return { mode, preference, hydrated: true }
    }),
  )

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

  /** Asserts the document from the adopted state. */
  const writeCurrent = useCallback(() => {
    const { mode, preference } = store.getSnapshot()
    writeAttributes(mode, preference)
  }, [store, writeAttributes])

  // The handover from the pre-paint script, in a layout effect so the document
  // is asserted before anything paints. It adopts the reader's mode if no reader
  // has asked for it yet. It sets no React state: readers catch up from the
  // store as each of them hydrates.
  useIsomorphicLayoutEffect(writeCurrent, [])

  // Write-through: the document is asserted from the adopted state whenever the
  // provider renders, so anything that discards the attribute — a view
  // transition, an extension, a framework touching the root — is repaired on the
  // next render rather than leaving every `[data-theme=…]` selector unmatched.
  useEffect(writeCurrent)

  const applyMode = useCallback(
    (next: ResolvedThemeMode) => {
      store.update({ mode: next })
      writeCurrent()
    },
    [store, writeCurrent],
  )

  useEffect(() => {
    if (!system) return
    let media: MediaQueryList | undefined
    try {
      media = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
    } catch {
      return
    }
    if (!media?.addEventListener) return
    // Only a reader following the OS moves with it.
    const onChange = (event: MediaQueryListEvent) => {
      if (store.getSnapshot().preference === 'system') applyMode(event.matches ? system.dark : system.light)
    }
    media.addEventListener('change', onChange)
    return () => media?.removeEventListener('change', onChange)
  }, [applyMode, store, system])

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
      writeStored(storageKey, next)
      store.update({ preference: next, mode: next === 'system' ? resolveSystemMode() : next })
      // Written even when nothing changed: choosing the mode already in force is
      // exactly the call someone makes when the document has lost the attribute
      // and the control looks stuck.
      writeCurrent()
    },
    [canFollowSystem, modes, resolveSystemMode, storageKey, store, writeCurrent],
  )

  const setMode = useCallback((next: ResolvedThemeMode) => setPreference(next), [setPreference])

  // Stable across renders that change nothing it holds, and so across every
  // change of mode: a new value here would reach every boundary below.
  const contextValue = useMemo<ThemeContextState>(
    () => ({ store, theme: { mode: defaultMode as Theme['mode'], system: tokens }, modes, setMode, setPreference }),
    [store, defaultMode, tokens, modes, setMode, setPreference],
  )

  return Node(ThemeContext.Provider, { value: contextValue, children: composeChildren(children, tokens, defaultMode as Theme['mode']) }).render()
}

;(ThemeProvider as { __meonodeAcceptsServerCss?: boolean }).__meonodeAcceptsServerCss = true
