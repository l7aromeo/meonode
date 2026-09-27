'use client'

import { useEffect } from 'react'
import { Div, P, Section } from '@meonode/ui'

declare global {
  interface Window {
    __articleMounted?: number
  }
}

/**
 * A scrolling article with a `#target` section far down it.
 *
 * `data-rendered-on` is the side that rendered this element. Hydration keeps a
 * server attribute as it is, so a server-rendered article that hydrates reads
 * `server`; one whose server HTML was discarded and rendered again on the client
 * reads `client`.
 */
export function Article({ label }: { label: string }) {
  useEffect(() => {
    window.__articleMounted = (window.__articleMounted ?? 0) + 1
  }, [])
  return Div({
    'data-testid': 'content',
    'data-rendered-on': typeof window === 'undefined' ? 'server' : 'client',
    suppressHydrationWarning: true,
    height: '400px',
    overflowY: 'auto',
    children: Array.from({ length: 40 }, (_, i) =>
      i === 30
        ? Section({ key: i, id: 'target', height: '200px', children: `${label}: target` })
        : P(`${label}: paragraph ${i}`, { key: i, height: '120px', margin: 0 }),
    ),
  }).render()
}
