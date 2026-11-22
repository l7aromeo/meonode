// Rules from one node reaching another (parts/cross-nodes.ts), rendered on the client only.
// Every reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { CrossNodes } from './parts/cross-nodes.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.child', 'sel.descendant', 'sel.where-is-has', 'sel.self-class', 'place.component-target', 'place.css', 'env.client-only'],
  routes: ['STATIC'],
  render: 'client',
}

export function App(): ReactElement {
  return createElement(CrossNodes)
}
