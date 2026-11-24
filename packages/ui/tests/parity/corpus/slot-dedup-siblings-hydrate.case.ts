// Named nodes that share one style: two named siblings with one style, the
// second holding a useId consumer (parts/slot-dedup.ts), server-rendered, then
// hydrated. Every element must match extraction off with no hydration error.
import { createElement, type ReactElement } from 'react'
import { Siblings } from './parts/slot-dedup.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.css', 'env.ssr-hydrate'],
  routes: ['NAMED'],
  firstPaint: true,
  routing: [
    { node: 'sib-a', route: 'NAMED' },
    { node: 'sib-b', route: 'NAMED' },
  ],
  expected: [
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
  return createElement(Siblings)
}
