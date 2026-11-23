// The unrendered-negation page reached by client navigation: rendered on the
// client, then switched to a second view, neither of which renders the
// imported nodes whose selectors can match without them.
import { useState, type ReactElement } from 'react'
import { Button, Div, P } from '@meonode/ui'
import { Unrendered } from './parts/negation-hidden.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.not', 'sel.where-is-has', 'sel.comma', 'place.css', 'dyn.state', 'env.client-only'],
  routes: ['CARRIER', 'NAMED'],
  routing: [
    { node: 'not-self', route: 'CARRIER' },
    { node: 'is-self', route: 'NAMED' },
    { node: 'where-self', route: 'NAMED' },
    { node: 'other', route: 'NAMED' },
    // Emotion's compat attaches a colon-leading key to its parent, so the selector names the node twice.
    { node: 'has-self', route: 'NAMED' },
  ],
  render: 'client',
  steps: [{ name: 'navigate', click: '[data-act="go"]' }],
}

/** Imported so its module is in the page, never rendered. */
export const notRendered = Unrendered

export function App(): ReactElement {
  const [second, setSecond] = useState(false)
  return Div({
    children: [
      Button('go', { key: 'go', type: 'button', 'data-act': 'go', onClick: () => setSecond(true) }),
      second
        ? Div({ key: 'second', children: [P('second view', { key: 'p' }), P('an .other paragraph', { key: 'o', className: 'other' })] })
        : Div({ key: 'first', children: [P('first view', { key: 'p' }), P('an .x paragraph', { key: 'x', className: 'x' })] }),
    ],
  } as never).render() as ReactElement
}
