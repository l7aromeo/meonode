// Structural pseudo-classes (parts/structural.ts), server-rendered, read before
// hydration and after it. Every element's computed style must match
// extraction off at both moments.
import { createElement, type ReactElement } from 'react'
import { Structural } from './parts/structural.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.child', 'sel.sibling', 'sel.structural', 'place.css', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'RUNTIME:css-not-literal'],
  firstPaint: true,
  routing: [
    { node: 'first-child', route: 'CARRIER' },
    // Routing is found by a literal `key`; the children built from a prefix have none, so the runtime claim is on the adjacent pair's.
    { node: 'adjacent-runtime', route: 'RUNTIME:css-not-literal' },
    { node: 'adjacent-static', route: 'CARRIER' },
  ],
  expected: [
    {
      // Emotion's own behaviour in each mode, so both builds share it.
      reason:
        "before hydration, [plain] has Emotion's <style> elements among the siblings, which structural selectors count, while [registry] has them in the head",
      sides: ['runtime-modes'],
      modes: ['registry'],
      dimension: 'first-paint',
      text: ': oracle ',
    },
  ],
}

export function App(): ReactElement {
  return createElement(Structural)
}
