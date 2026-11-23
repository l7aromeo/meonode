// A run-time value invalid for its property (parts/invalid-value.ts), server-rendered, then hydrated.
// Under forced :hover each node's margin-top must match extraction off.
import { createElement, type ReactElement } from 'react'
import { FLIP, INVALID_PAGE_CSS, InvalidValues } from './parts/invalid-value.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['value.runtime', 'dyn.conditional', 'dyn.state', 'sel.ancestor', 'sel.pseudo-class', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'RUNTIME:switch-cap', 'TEMPLATE'],
  routing: [
    { node: 'invalid-switch', route: 'CARRIER' },
    { node: 'invalid-var', route: 'TEMPLATE' },
    { node: 'invalid-over-cap', route: 'RUNTIME:switch-cap' },
  ],
  force: 'marked',
  pageCss: INVALID_PAGE_CSS,
  steps: [{ name: 'flip the conditions', click: FLIP }],
}

export function App(): ReactElement {
  return createElement(InvalidValues)
}
