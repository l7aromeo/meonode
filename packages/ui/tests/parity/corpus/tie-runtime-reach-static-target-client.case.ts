// Tie: a runtime reaching rule against an extracted target (parts/ties.ts), mounted on the client only.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { RuntimeReachStaticTarget } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.child', 'place.css', 'env.client-only'],
  routes: ['CARRIER', 'NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  render: 'client',
  routing: [
    { node: 'rrst-runtime-parent', route: 'RUNTIME:css-not-literal' },
    { node: 'rrst-reached', route: 'CARRIER' },
  ],
}

export function App(): ReactElement {
  return createElement(RuntimeReachStaticTarget)
}
