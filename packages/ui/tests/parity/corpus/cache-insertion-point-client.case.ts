// Extracted rules under an Emotion cache with an insertionPoint before the page CSS (parts/cache-placement.ts), mounted on the client only.
// The card's padding against the page's .card, and the runtime rules added
// after load against extracted ones, must match extraction off.
import { createElement, type ReactElement } from 'react'
import { CARD_PAGE_CSS, InsertionPointCache, MOUNT_PARENT } from './parts/cache-placement.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  render: 'client',
  shapes: ['place.style-props', 'place.classname-merge', 'sel.child', 'dyn.state', 'env.client-only'],
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
  return createElement(InsertionPointCache)
}
