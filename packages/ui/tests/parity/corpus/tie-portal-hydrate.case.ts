// Tie: a portalled DOM descendant of the node whose rule reaches it, server-rendered, then hydrated (parts/ties.ts).
// The portal opens after mount, so the oracle hydrates cleanly; a portal opened in the first render cannot hydrate,
// since the server renders none. The reached element's computed colour must match extraction off.
import { createElement, type ReactElement } from 'react'
import { PortalAfterMount } from './parts/ties.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.descendant', 'sel.self-class', 'place.css', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  routing: [
    { node: 'port-reacher', route: 'CARRIER' },
    { node: 'port-reached', route: 'CARRIER' },
  ],
}

export function App(): ReactElement {
  return createElement(PortalAfterMount)
}
