// Tie: a later-rendered node's .a:has(&) against its runtime ancestor's own rule (parts/ties.ts), mounted on the client only.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { LaterHasRuntimeAncestor } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.where-is-has', 'sel.self-class', 'place.css', 'env.client-only'],
  routes: ['CARRIER', 'NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  render: 'client',
  routing: [
    { node: 'lhas-reached', route: 'RUNTIME:css-not-literal' },
    { node: 'lhas-has-child', route: 'CARRIER' },
  ],
}

export function App(): ReactElement {
  return createElement(LaterHasRuntimeAncestor)
}
