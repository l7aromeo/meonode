// Rules from one node reaching another (parts/cross-nodes.ts), server-rendered, then hydrated.
// Every reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { CrossNodes } from './parts/cross-nodes.js'
import type { CaseMeta } from '../case.js'

/** Why runtime [registry] and runtime [plain] differ here. */
const MODE_REASON =
  "[plain] writes a node's <style> again at each occurrence, so the repeated rule comes last; [registry] writes each class once, at its first insertion, as Emotion's Next registry recipe does: each mode's own reference order"

export const meta: CaseMeta = {
  shapes: ['sel.child', 'sel.descendant', 'sel.where-is-has', 'sel.self-class', 'place.component-target', 'place.css', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'NAMED', 'RUNTIME:css-not-literal'],
  // The registry check: runtime [registry] against runtime [plain].
  expected: [
    {
      reason: MODE_REASON,
      sides: ['runtime-modes'],
      modes: ['registry'],
      dimension: 'computed',
      text: 'div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > span:nth-child(1)',
    },
    {
      reason: MODE_REASON,
      sides: ['runtime-modes'],
      modes: ['registry'],
      dimension: 'pseudo-element',
      text: 'div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > span:nth-child(1)',
    },
    {
      reason: MODE_REASON,
      sides: ['runtime-modes'],
      modes: ['registry'],
      dimension: 'theme-mode',
      text: 'div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > span:nth-child(1)',
    },
    {
      reason: MODE_REASON,
      sides: ['runtime-modes'],
      modes: ['registry'],
      dimension: 'color-scheme',
      text: 'div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > span:nth-child(1)',
    },
  ],
}

export function App(): ReactElement {
  return createElement(CrossNodes)
}
