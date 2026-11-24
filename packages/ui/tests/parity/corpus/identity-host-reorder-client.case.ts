// Identity across a step: a runtime-styled sibling moved from before a named node to after it, and back (parts/identity.ts). The named node keeps its
// element, and the input typed into inside it keeps its value, as with
// extraction off; only the identity dimension can show a remount here.
//
// Mounted on the client only (createRoot, no server HTML): identity-host-reorder.case.ts's page, as an SPA renders it.
import { createElement, type ReactElement } from 'react'
import type { CaseMeta } from '../case.js'
import { HostReorder, PROBE, TOGGLE } from './parts/identity.js'

export const meta: CaseMeta = {
  render: 'client',
  shapes: ['dyn.state', 'dyn.conditional', 'dyn.sibling-toggle', 'env.client-only'],
  routes: ['CARRIER', 'JOINED', 'RUNTIME:dynamic-value'],
  routing: [{ node: 'x-host-reorder', route: 'CARRIER' }],
  steps: [
    { name: 'typed', type: [PROBE, 'kept'] },
    { name: 'toggled', click: TOGGLE },
    { name: 'toggled back', click: TOGGLE },
  ],
}

export function App(): ReactElement {
  return createElement(HostReorder)
}
