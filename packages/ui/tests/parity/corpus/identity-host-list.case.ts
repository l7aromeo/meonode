// Identity across a step: a list of runtime-styled items before a named node, emptied and refilled (parts/identity.ts). The named node keeps its
// element, and the input typed into inside it keeps its value, as with
// extraction off; only the identity dimension can show a remount here.
import { createElement, type ReactElement } from 'react'
import type { CaseMeta } from '../case.js'
import { HostList, PROBE, TOGGLE } from './parts/identity.js'

export const meta: CaseMeta = {
  shapes: ['dyn.state', 'dyn.conditional', 'dyn.sibling-toggle', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'JOINED', 'RUNTIME:dynamic-value'],
  routing: [{ node: 'x-host-list', route: 'CARRIER' }],
  steps: [
    { name: 'typed', type: [PROBE, 'kept'] },
    { name: 'toggled', click: TOGGLE },
    { name: 'toggled back', click: TOGGLE },
  ],
}

export function App(): ReactElement {
  return createElement(HostList)
}
