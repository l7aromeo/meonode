// Tie: a runtime reaching rule against an extracted target (parts/ties.ts), server-rendered, then hydrated.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { RuntimeReachStaticTarget } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.child', 'place.css', 'env.ssr-hydrate'],
  routes: ['STATIC', 'runtime:css-not-literal'],
  routing: [
    { node: 'rrst-runtime-parent', route: 'runtime:css-not-literal', whole: true },
    { node: 'rrst-reached', route: 'STATIC', extracted: ['color'] },
  ],
}

export function App(): ReactElement {
  return createElement(RuntimeReachStaticTarget)
}
