// Cross-node ties at equal specificity (B's S1–S3), S2 and S3 with the children's module evaluated first. Server-rendered, then hydrated.
// The computed colour of each tied element must match extraction off.
import { createElement, type ReactElement } from 'react'
import './parts/s-split-child.js'
import { Shapes } from './parts/s-split-parent.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.sibling', 'sel.descendant', 'sel.ancestor', 'sel.child', 'place.component-target', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'RUNTIME:not-extractable'],
}

export function App(): ReactElement {
  return createElement(Shapes)
}
