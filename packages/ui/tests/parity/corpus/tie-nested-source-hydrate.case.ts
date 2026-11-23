// Tie: an extracted target's own rule against a .a:has(&) source nested under it in a component's render (parts/ties.ts), server-rendered, then hydrated.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { NestedSourceUnderTarget } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.where-is-has', 'sel.self-class', 'place.component-target', 'place.css', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  routing: [
    { node: 'nsrc-reached', route: 'CARRIER' },
    { node: 'nsrc-has-child', route: 'CARRIER' },
  ],
}

export function App(): ReactElement {
  return createElement(NestedSourceUnderTarget)
}
