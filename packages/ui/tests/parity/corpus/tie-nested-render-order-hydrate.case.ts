// Tie: an outer node rendered before a component, against the component's own rule (parts/ties.ts), server-rendered, then hydrated.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { NestedRenderOuterFirst } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.child', 'sel.descendant', 'place.component-target', 'place.css', 'env.ssr-hydrate'],
  routes: ['NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  routing: [
    { node: 'nro-outer', route: 'NAMED' },
    { node: 'nro-inner', route: 'NAMED' },
  ],
}

export function App(): ReactElement {
  return createElement(NestedRenderOuterFirst)
}
