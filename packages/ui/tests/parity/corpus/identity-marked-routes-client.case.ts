// Identity across a step: a plain, a themed and a merged named node, each
// after a component on some renders and after a rule on others
// (parts/identity.ts). The compiler marks all three carriers; the plain and
// the merged node keep their elements across the toggle, as with extraction
// off. The case hosts the marker check's strip plants for each route.
//
// Mounted on the client only (createRoot, no server HTML): identity-marked-routes.case.ts's page, as an SPA renders it.
import { createElement, type ReactElement } from 'react'
import type { CaseMeta } from '../case.js'
import { MarkedRoutes, TOGGLE } from './parts/identity.js'

export const meta: CaseMeta = {
  render: 'client',
  shapes: ['dyn.state', 'dyn.conditional', 'dyn.sibling-toggle', 'at.token-in-key', 'env.client-only'],
  routes: ['CARRIER', 'FACTORY_MERGED', 'NAMED', 'NAMED_THEMED'],
  routing: [
    { node: 'marked-page', route: 'NAMED' },
    { node: 'marked-plain', route: 'CARRIER' },
    { node: 'marked-themed', route: 'NAMED_THEMED', carrier: true },
    { node: 'marked-merged', route: 'FACTORY_MERGED', carrier: true },
  ],
  steps: [
    { name: 'toggled', click: TOGGLE },
    { name: 'toggled back', click: TOGGLE },
  ],
  breakpoints: [600],
}

export function App(): ReactElement {
  return createElement(MarkedRoutes)
}
