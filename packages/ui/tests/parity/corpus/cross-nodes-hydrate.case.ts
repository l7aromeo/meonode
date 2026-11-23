// Rules from one node reaching another (parts/cross-nodes.ts), server-rendered, then hydrated.
// Every reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { CrossNodes } from './parts/cross-nodes.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.child', 'sel.descendant', 'sel.where-is-has', 'sel.self-class', 'place.component-target', 'place.css', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'NAMED', 'RUNTIME:css-not-literal'],
}

export function App(): ReactElement {
  return createElement(CrossNodes)
}
