// @layer rules on the runtime path (parts/layers.ts), reached by client navigation from another view.
// Each layered element's computed style must match extraction off.
import { createElement, useState, type ReactElement } from 'react'
import { Button, Div } from '@meonode/ui'
import { ADD_OUTER_LAYER, Layers, LAYERS_PAGE_CSS } from './parts/layers.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['at.layer', 'at.nested', 'place.css', 'place.classname-merge', 'place.component-target', 'dyn.state', 'env.client-only'],
  routes: ['STATIC', 'runtime:at-rule-other'],
  routing: [
    { node: 'l1-outer', route: 'runtime:at-rule-other', runtime: ['@layer a'] },
    { node: 'l3-extracted', route: 'STATIC', extracted: ['padding'] },
  ],
  render: 'client',
  pageCss: LAYERS_PAGE_CSS,
  steps: [
    { name: 'navigate to the layers', click: '[data-act="go"]' },
    { name: 'add the outer layer', click: ADD_OUTER_LAYER },
  ],
}

export function App(): ReactElement {
  const [there, setThere] = useState(false)
  return Div({
    children: [
      Button('go', { key: 'go', type: 'button', 'data-act': 'go', onClick: () => setThere(true) }),
      there ? createElement(Layers, { key: 'layers' }) : Div({ key: 'elsewhere', children: 'another view' }),
    ],
  } as never).render() as ReactElement
}
