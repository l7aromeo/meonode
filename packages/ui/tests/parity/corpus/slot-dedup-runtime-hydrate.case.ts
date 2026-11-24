// Named nodes that share one style: a runtime node, then a named node with the
// same css holding a useId consumer (parts/slot-dedup.ts), server-rendered,
// then hydrated. Every element must match extraction off with no hydration
// error.
import { createElement, type ReactElement } from 'react'
import { RuntimeThenNamed } from './parts/slot-dedup.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.css', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'RUNTIME:css-not-literal'],
  firstPaint: true,
  routing: [
    { node: 'rt-runtime', route: 'RUNTIME:css-not-literal' },
    { node: 'rt-named', route: 'CARRIER' },
  ],
}

export function App(): ReactElement {
  return createElement(RuntimeThenNamed)
}
