// Tie: a node repeated after a target its rule reaches, with no cache provider (parts/ties.ts), mounted on the client only.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { SsrRepeat } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.child', 'place.css', 'env.client-only'],
  routes: ['CARRIER', 'NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  render: 'client',
  routing: [
    { node: 'rep-own', route: 'CARRIER' },
    { node: 'rep-reached', route: 'NAMED' },
  ],
}

export function App(): ReactElement {
  return createElement(SsrRepeat)
}
