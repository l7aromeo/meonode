'use client'

import { useEffect } from 'react'
import { Div } from '@meonode/ui'

declare global {
  interface Window {
    __themeProbeMounted?: number
  }
}

/** Held back by the test with the rest of the on-demand chunks carrying this marker. */
export const CHUNK_MARKER = '__meonode_delayed_hydration_chunk__'

/**
 * An element whose css colour is a theme function reading the mode, as the
 * theming guide shows, and which records the side that rendered it.
 */
export function ThemedProbe() {
  useEffect(() => {
    window.__themeProbeMounted = (window.__themeProbeMounted ?? 0) + 1
  }, [])
  return Div({
    'data-testid': 'theme-fn',
    'data-chunk': CHUNK_MARKER,
    'data-rendered-on': typeof window === 'undefined' ? 'server' : 'client',
    suppressHydrationWarning: true,
    css: { color: theme => (theme.mode === 'dark' ? 'rgb(1, 2, 3)' : 'rgb(4, 5, 6)') },
    children: 'theme function',
  }).render()
}
