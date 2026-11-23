// Tie: a runtime reaching rule against an extracted target (parts/ties.ts), server-rendered, then hydrated.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { RuntimeReachStaticTarget } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.child', 'place.css', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  routing: [
    { node: 'rrst-runtime-parent', route: 'RUNTIME:css-not-literal' },
    { node: 'rrst-reached', route: 'CARRIER' },
  ],
}

export function App(): ReactElement {
  return createElement(RuntimeReachStaticTarget)
}
