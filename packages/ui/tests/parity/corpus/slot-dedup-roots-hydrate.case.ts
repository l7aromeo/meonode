// Named nodes that share one style: two roots with one style, the second
// holding a useId consumer (parts/slot-dedup.ts), server-rendered, then
// hydrated. Every element must match extraction off with no hydration error.
import { createElement, type ReactElement } from 'react'
import { TwoRoots } from './parts/slot-dedup.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.css', 'env.ssr-hydrate'],
  routes: ['NAMED'],
  firstPaint: true,
  routing: [
    { node: 'root-a', route: 'NAMED' },
    { node: 'root-b', route: 'NAMED' },
  ],
}

export function App(): ReactElement {
  return createElement(TwoRoots)
}
