// Tie: a node repeated after a target its rule reaches, under a cache provider (parts/ties.ts),
// server-rendered, then hydrated. The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { SsrRepeatProvided } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.child', 'place.css', 'env.ssr-hydrate'],
  routes: ['NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  routing: [
    { node: 'rep-own', route: 'NAMED' },
    { node: 'rep-reached', route: 'NAMED' },
  ],
}

export function App(): ReactElement {
  return createElement(SsrRepeatProvided)
}
