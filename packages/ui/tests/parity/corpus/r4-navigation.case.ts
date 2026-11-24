// The cross-module rule pair loaded as a client navigation would: the child's
// module first and the child rendered alone, then the parent around it. With
// Emotion the child's class is inserted first and keeps that position; the
// computed colour after the navigation must match with extraction on.
import { createElement, useState, type ReactElement } from 'react'
import { Button, Div } from '@meonode/ui'
import { Child } from './parts/r4b-child.js'
import { Parent } from './parts/r4b-parent.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.descendant', 'sel.ancestor', 'place.css', 'dyn.state', 'env.client-only'],
  routes: ['CARRIER'],
  render: 'client',
  steps: [{ name: 'navigate to the parent', click: '[data-act="go"]' }],
}

export function App(): ReactElement {
  const [there, setThere] = useState(false)
  return Div({
    children: [
      Button('go', { key: 'go', type: 'button', 'data-act': 'go', onClick: () => setThere(true) }),
      there ? createElement(Parent, { key: 'there' }, createElement(Child)) : Div({ key: 'here', className: 'wrapper', children: createElement(Child) }),
    ],
  } as never).render() as ReactElement
}
