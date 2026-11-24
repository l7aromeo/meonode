// Two named siblings whose rules both go in with their parent's on some renders (parts/class-only-run.ts), mounted on the client only.
// The target's computed colour must match extraction off on every step.
import { createElement, type ReactElement } from 'react'
import { ClassOnlyRun } from './parts/class-only-run.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.sibling', 'place.css', 'dyn.state', 'env.client-only'],
  routes: ['CARRIER'],
  render: 'client',
  steps: [
    { name: 'show the badges', click: '[data-act="toggle"]' },
    { name: 'hide the badges', click: '[data-act="toggle"]' },
  ],
  routing: [
    { node: 'cor-a', route: 'CARRIER' },
    { node: 'cor-b', route: 'CARRIER' },
  ],
}

export function App(): ReactElement {
  return createElement(ClassOnlyRun)
}
