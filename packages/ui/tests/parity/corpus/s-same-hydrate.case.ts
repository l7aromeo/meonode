// Cross-node ties at equal specificity (B's S1–S3), every node in one module. Server-rendered, then hydrated.
// The computed colour of each tied element must match extraction off.
import { createElement, type ReactElement } from 'react'
import { Shapes } from './parts/s-same.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.sibling', 'sel.descendant', 'sel.ancestor', 'sel.child', 'place.component-target', 'env.ssr-hydrate'],
  routes: ['STATIC'],
}

export function App(): ReactElement {
  return createElement(Shapes)
}
