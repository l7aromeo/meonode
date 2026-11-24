// Tie: a runtime grandparent's descendant rule against an extracted parent's child rule (parts/ties.ts), mounted on the client only.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { RuntimeGrandparentStaticParent } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.child', 'sel.descendant', 'place.css', 'env.client-only'],
  routes: ['CARRIER', 'NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  render: 'client',
  routing: [
    { node: 'rgsp-runtime-grandparent', route: 'RUNTIME:css-not-literal' },
    { node: 'rgsp-static-parent', route: 'CARRIER' },
  ],
}

export function App(): ReactElement {
  return createElement(RuntimeGrandparentStaticParent)
}
