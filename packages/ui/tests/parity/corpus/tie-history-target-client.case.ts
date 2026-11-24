// Tie: a target whose class was first inserted before the rule that reaches it (parts/ties.ts), mounted on the client only.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { HistoryTarget } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.child', 'place.component-target', 'place.css', 'env.client-only'],
  routes: ['NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  render: 'client',
  routing: [{ node: 'hist-parent', route: 'NAMED' }],
}

export function App(): ReactElement {
  return createElement(HistoryTarget)
}
