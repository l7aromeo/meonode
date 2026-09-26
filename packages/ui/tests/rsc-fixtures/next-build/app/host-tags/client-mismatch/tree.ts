'use client'
import { Div } from '@meonode/ui'

/**
 * Renders different text on the server and in the browser. A hydration error is
 * the expected outcome: its only job is to show that the probe reading hydration
 * errors on `/host-tags/client` is listening.
 */
export function MismatchedTree() {
  return Div({ 'data-testid': 'client-mismatch', css: { color: 'rgb(1, 2, 3)' }, children: typeof window === 'undefined' ? 'server' : 'browser' }).render()
}
