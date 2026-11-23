// @layer rules on the runtime path (parts/layers.ts), server-rendered, then hydrated.
// Each layered element's computed style must match extraction off.
import { createElement, type ReactElement } from 'react'
import { ADD_OUTER_LAYER, Layers, LAYERS_PAGE_CSS } from './parts/layers.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['at.layer', 'at.nested', 'place.css', 'place.classname-merge', 'place.component-target', 'dyn.state', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  routing: [
    { node: 'l1-outer', route: 'CARRIER' },
    { node: 'l1-inner', route: 'NAMED' },
    { node: 'l1-inner-first', route: 'CARRIER' },
    { node: 'l2', route: 'CARRIER' },
    { node: 'l3-layered', route: 'NAMED' },
    { node: 'l3-extracted', route: 'CARRIER' },
  ],
  pageCss: LAYERS_PAGE_CSS,
  steps: [{ name: 'add the outer layer', click: ADD_OUTER_LAYER }],
}

export function App(): ReactElement {
  return createElement(Layers)
}
