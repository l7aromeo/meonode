// Tie: a runtime grandparent's descendant rule against an extracted parent's child rule (parts/ties.ts), mounted on the client only.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { RuntimeGrandparentStaticParent } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.child', 'sel.descendant', 'place.css', 'env.client-only'],
  routes: ['STATIC', 'runtime:css-not-literal'],
  render: 'client',
  routing: [
    { node: 'rgsp-runtime-grandparent', route: 'runtime:css-not-literal', whole: true },
    { node: 'rgsp-static-parent', route: 'STATIC', extracted: ['& > *'] },
  ],
}

export function App(): ReactElement {
  return createElement(RuntimeGrandparentStaticParent)
}
