// Tie: a later-rendered node's .a:has(&) against its runtime ancestor's own rule (parts/ties.ts), server-rendered, then hydrated.
// The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { LaterHasRuntimeAncestor } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.where-is-has', 'sel.self-class', 'place.css', 'env.ssr-hydrate'],
  routes: ['STATIC', 'runtime:css-not-literal'],
  routing: [
    { node: 'lhas-reached', route: 'runtime:css-not-literal', whole: true },
    { node: 'lhas-has-child', route: 'STATIC', extracted: ['.a:has(&)'] },
  ],
}

export function App(): ReactElement {
  return createElement(LaterHasRuntimeAncestor)
}
