// @layer rules on the runtime path (parts/layers.ts), rendered on the client only.
// Each layered element's computed style must match extraction off.
import { createElement, type ReactElement } from 'react'
import { ADD_OUTER_LAYER, Layers, LAYERS_PAGE_CSS } from './parts/layers.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['at.layer', 'at.nested', 'place.css', 'place.classname-merge', 'place.component-target', 'dyn.state', 'env.client-only'],
  routes: ['STATIC', 'runtime:at-rule-other'],
  routing: [
    { node: 'l1-outer', route: 'runtime:at-rule-other', runtime: ['@layer a'] },
    { node: 'l1-inner', route: 'runtime:at-rule-other', runtime: ['@layer b'] },
    { node: 'l1-inner-first', route: 'runtime:at-rule-other', runtime: ['@layer b'] },
    { node: 'l2', route: 'runtime:at-rule-other', runtime: ['@layer x', '@layer y'] },
    { node: 'l3-layered', route: 'runtime:at-rule-other', runtime: ['@layer base'] },
    { node: 'l3-extracted', route: 'STATIC', extracted: ['padding'] },
  ],
  render: 'client',
  pageCss: LAYERS_PAGE_CSS,
  steps: [{ name: 'add the outer layer', click: ADD_OUTER_LAYER }],
}

export function App(): ReactElement {
  return createElement(Layers)
}
