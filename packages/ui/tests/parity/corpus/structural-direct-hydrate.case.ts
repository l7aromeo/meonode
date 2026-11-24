// Structural pseudo-classes over named children placed directly under their
// parent (parts/structural-direct.ts), server-rendered, read before hydration
// and after it. Every element's computed style must match extraction off at
// both moments, and a useId consumer's id must match the server's.
import { createElement, type ReactElement } from 'react'
import { StructuralDirect } from './parts/structural-direct.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.child', 'sel.sibling', 'sel.structural', 'place.css', 'env.ssr-hydrate'],
  routes: ['NAMED'],
  firstPaint: true,
  routing: [
    { node: 'direct-first', route: 'NAMED' },
    { node: 'df-1', route: 'NAMED' },
    { node: 'direct-nth', route: 'NAMED' },
    { node: 'dn-2', route: 'NAMED' },
    { node: 'da-1', route: 'NAMED' },
    { node: 'da-2', route: 'NAMED' },
    { node: 'dg-1', route: 'NAMED' },
    { node: 'dg-3', route: 'NAMED' },
    { node: 'di-1', route: 'NAMED' },
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
    {
      // useId strings are opaque (React promises only that server and client agree, which the hydration
      // dimension holds at 0 errors). In [registry] the "on" side renders fewer fibers before a named node than
      // the runtime's Emotion path, so the id differs from extraction off; [plain] renders style slots and matches.
      reason: 'the useId text under a named node in the server HTML: ids are opaque, and server and client agree',
      sides: ['on'],
      modes: ['registry'],
      dimension: 'ssr-html',
      text: 'id _R_',
    },
    {
      // useId strings are opaque (React promises only that server and client agree, which the hydration
      // dimension holds at 0 errors). In [registry] the "on" side renders fewer fibers before a named node than
      // the runtime's Emotion path, so the id differs from extraction off; [plain] renders style slots and matches.
      reason: 'the useId text under a named node in the tree after hydration: ids are opaque, and server and client agree',
      sides: ['on'],
      modes: ['registry'],
      dimension: 'tree',
      text: 'id _R_',
    },
    {
      // useId strings are opaque (React promises only that server and client agree, which the hydration
      // dimension holds at 0 errors). In [registry] the "on" side renders fewer fibers before a named node than
      // the runtime's Emotion path, so the id differs from extraction off; [plain] renders style slots and matches.
      reason: 'the useId text under a named node in the tree before hydration: ids are opaque, and server and client agree',
      sides: ['on'],
      modes: ['registry'],
      dimension: 'first-paint',
      text: 'id _R_',
    },
  ],
}

export function App(): ReactElement {
  return createElement(StructuralDirect)
}
