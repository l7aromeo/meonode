// Tie: a runtime grandparent's descendant rule against an extracted parent's child rule (parts/ties.ts), server-rendered, then hydrated.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { RuntimeGrandparentStaticParent } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.child', 'sel.descendant', 'place.css', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  routing: [
    { node: 'rgsp-runtime-grandparent', route: 'RUNTIME:css-not-literal' },
    { node: 'rgsp-static-parent', route: 'CARRIER' },
  ],
}

export function App(): ReactElement {
  return createElement(RuntimeGrandparentStaticParent)
}
