// Tie: an extracted target's own rule against a .a:has(&) source nested under it in a component's render (parts/ties.ts), mounted on the client only.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { NestedSourceUnderTarget } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.where-is-has', 'sel.self-class', 'place.component-target', 'place.css', 'env.client-only'],
  routes: ['NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  render: 'client',
  routing: [
    { node: 'nsrc-reached', route: 'NAMED' },
    { node: 'nsrc-has-child', route: 'NAMED' },
  ],
}

export function App(): ReactElement {
  return createElement(NestedSourceUnderTarget)
}
