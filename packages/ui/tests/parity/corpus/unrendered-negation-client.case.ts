// The unrendered-negation page reached by client navigation: rendered on the
// client, then switched to a second view, neither of which renders the
// imported nodes whose selectors can match without them.
import { useState, type ReactElement } from 'react'
import { Button, Div, P } from '@meonode/ui'
import { Unrendered } from './parts/negation-hidden.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.not', 'sel.where-is-has', 'sel.comma', 'place.css', 'dyn.state', 'env.client-only'],
  routes: ['STATIC', 'runtime:node-free-selector', 'runtime:self-reference', 'runtime:selector-list-mixed-reach'],
  routing: [
    { node: 'not-self', route: 'runtime:node-free-selector', runtime: [':not(&)'], whole: true },
    { node: 'is-self', route: 'runtime:node-free-selector', runtime: [':is(&, .x)'], whole: true },
    { node: 'where-self', route: 'runtime:node-free-selector', runtime: [':where(&, .x)'], whole: true },
    { node: 'other', route: 'runtime:selector-list-mixed-reach', runtime: ['&, .other'], extracted: ['paddingLeft'] },
    // Emotion's compat attaches a colon-leading key to its parent, so the selector names the node twice.
    { node: 'has-self', route: 'runtime:self-reference', runtime: [':has(&)'], whole: true },
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
