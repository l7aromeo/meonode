// Tie: a node repeated after a target its rule reaches, with no cache provider (parts/ties.ts), server-rendered, then hydrated.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { SsrRepeat } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

/** Why runtime [registry] and runtime [plain] differ here. */
const MODE_REASON =
  "[plain] writes a node's <style> again at each occurrence, so the repeated rule comes last; [registry] writes each class once, at its first insertion, as Emotion's Next registry recipe does: each mode's own reference order"

export const meta: CaseMeta = {
  shapes: ['sel.child', 'place.css', 'env.ssr-hydrate'],
  routes: ['NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  routing: [
    { node: 'rep-own', route: 'NAMED' },
    { node: 'rep-reached', route: 'NAMED' },
  ],
  // The registry check: runtime [registry] against runtime [plain].
  expected: [
    {
      reason: MODE_REASON,
      sides: ['runtime-modes'],
      modes: ['registry'],
      dimension: 'computed',
      text: 'div:nth-child(2) > div:nth-child(1) > span:nth-child(1)',
    },
    {
      reason: MODE_REASON,
      sides: ['runtime-modes'],
      modes: ['registry'],
      dimension: 'pseudo-element',
      text: 'div:nth-child(2) > div:nth-child(1) > span:nth-child(1)',
    },
    {
      reason: MODE_REASON,
      sides: ['runtime-modes'],
      modes: ['registry'],
      dimension: 'theme-mode',
      text: 'div:nth-child(2) > div:nth-child(1) > span:nth-child(1)',
    },
    {
      reason: MODE_REASON,
      sides: ['runtime-modes'],
      modes: ['registry'],
      dimension: 'color-scheme',
      text: 'div:nth-child(2) > div:nth-child(1) > span:nth-child(1)',
    },
  ],
}

export function App(): ReactElement {
  return createElement(SsrRepeat)
}
