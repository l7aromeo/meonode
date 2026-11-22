// Tie: a portalled DOM descendant rendered earlier in React order than the node whose rule reaches it (parts/ties.ts), server-rendered, then hydrated.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { PortalEarlier } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.descendant', 'sel.self-class', 'place.css', 'env.ssr-hydrate'],
  routes: ['STATIC'],
  routing: [
    { node: 'port-reacher', route: 'STATIC', extracted: ['& .t'] },
    { node: 'port-reached', route: 'STATIC', extracted: ['&.t'] },
  ],
}

export function App(): ReactElement {
  return createElement(PortalEarlier)
}
