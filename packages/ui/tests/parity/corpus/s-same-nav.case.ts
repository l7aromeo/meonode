// Cross-node ties at equal specificity (B's S1–S3), every node in one module. Reached by client navigation from another view.
// The computed colour of each tied element must match extraction off.
import { createElement, useState, type ReactElement } from 'react'
import { Button, Div } from '@meonode/ui'
import { Shapes } from './parts/s-same.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.sibling', 'sel.descendant', 'sel.ancestor', 'sel.child', 'place.component-target', 'dyn.state', 'env.client-only'],
  routes: ['STATIC'],
  render: 'client',
  steps: [{ name: 'navigate to the shapes', click: '[data-act="go"]' }],
}

export function App(): ReactElement {
  const [there, setThere] = useState(false)
  return Div({
    children: [
      Button('go', { key: 'go', type: 'button', 'data-act': 'go', onClick: () => setThere(true) }),
      there ? createElement(Shapes, { key: 'shapes' }) : Div({ key: 'elsewhere', children: 'another view' }),
    ],
  } as never).render() as ReactElement
}
