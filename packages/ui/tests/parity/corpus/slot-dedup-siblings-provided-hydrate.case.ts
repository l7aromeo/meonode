// Named nodes that share one style: two named siblings with one style, the
// second holding a useId consumer (parts/slot-dedup.ts), under a provided
// cache, server-rendered, then hydrated. Every element must match extraction
// off with no hydration error.
import { createElement, type ReactElement } from 'react'
import { SiblingsProvided } from './parts/slot-dedup.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.css', 'env.ssr-hydrate'],
  routes: ['NAMED'],
  firstPaint: true,
  routing: [
    { node: 'sib-a', route: 'NAMED' },
    { node: 'sib-b', route: 'NAMED' },
  ],
}

export function App(): ReactElement {
  return createElement(SiblingsProvided)
}
