// Tie: a portalled DOM descendant rendered earlier in React order than the node whose rule reaches it (parts/ties.ts), mounted on the client only.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { PortalEarlier } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.descendant', 'sel.self-class', 'place.css', 'env.client-only'],
  routes: ['NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  render: 'client',
  routing: [
    { node: 'port-reacher', route: 'NAMED' },
    { node: 'port-reached', route: 'NAMED' },
  ],
}

export function App(): ReactElement {
  return createElement(PortalEarlier)
}
