// Extracted rules under the default Emotion cache (parts/cache-placement.ts), server-rendered as a fragment into the page, then hydrated.
// The card's padding against the page's .card, and the runtime rules added
// after load against extracted ones, must match extraction off.
import { createElement, type ReactElement } from 'react'
import { CARD_PAGE_CSS, DefaultCache, MOUNT_PARENT } from './parts/cache-placement.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.style-props', 'place.classname-merge', 'sel.child', 'dyn.state', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  routing: [
    { node: 'cache-card', route: 'CARRIER' },
    { node: 'cache-child', route: 'CARRIER' },
    { node: 'cache-parent', route: 'RUNTIME:css-not-literal' },
  ],
  pageCss: CARD_PAGE_CSS,
  steps: [{ name: 'add the runtime rules', click: MOUNT_PARENT }],
}

export function App(): ReactElement {
  return createElement(DefaultCache)
}
