'use client'
import { useContext, useEffect, useLayoutEffect, useMemo, useReducer, useSyncExternalStore } from 'react'
import { ThemeContext, type ThemeContextValue } from '@src/components/theme-provider.client.js'

/** `useLayoutEffect` on the client, `useEffect` on the server, where a layout effect never runs and React warns about one. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Access to the theme context.
 *
 * It writes nothing. Every consumer runs this hook, so a write here is a write
 * per reader of the theme — which is how a provider sitting on its default came
 * to overwrite a choice a consumer had just made. The provider owns the
 * document's `data-theme` and `data-theme-preference`, asserts them from its own
 * state, and moves them only when that state changes.
 *
 * The mode is read from the provider's store, not its context. While hydrating,
 * a reader renders the server's defaults, as it must to match the server's
 * markup, and takes the reader's own mode in the same commit, before paint. Only
 * that reader re-renders: nothing above it or beside it changes, so a boundary
 * elsewhere that has not hydrated yet keeps its server HTML.
 * @returns {ThemeContextValue} The theme context value.
 * @throws {Error} If used outside a ThemeProvider.
 */
export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  const { store } = context
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)

  // A render during hydration used the server's snapshot. When the reader's own
  // differs, render again before paint; React would otherwise catch up only in a
  // passive effect, after a frame showing the default.
  const [, renderAgain] = useReducer((count: number) => count + 1, 0)
  useIsomorphicLayoutEffect(() => {
    if (store.getSnapshot() !== snapshot) renderAgain()
  })

  return useMemo(
    () => ({
      theme: { mode: snapshot.mode, system: context.theme.system },
      mode: snapshot.mode,
      preference: snapshot.preference,
      hydrated: snapshot.hydrated,
      setMode: context.setMode,
      setPreference: context.setPreference,
      modes: context.modes,
    }),
    [snapshot, context],
  )
}
