// The target of the planted failures in plants.mjs, and a case of its own: a
// section with static styles, a breakpoint and a toggle whose pressed state
// switches a static colour.
import { useState, type ReactElement } from 'react'
import { Button, Input, Section, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.style-props', 'place.css', 'at.media', 'dyn.state', 'dyn.conditional', 'env.ssr-hydrate'],
  routes: ['STATIC', 'SWITCH', 'runtime:css-not-literal'],
  routing: [{ node: 'exact', route: 'runtime:css-not-literal', runtime: ['css'], whole: true }],
  breakpoints: [600],
  steps: [{ name: 'press', click: '[data-act="toggle"]' }],
}

/** Held in a variable, so the node stays whole on the runtime path and renders as with extraction off. */
const EXACT_CSS = { fontStyle: 'italic' }

export function App(): ReactElement {
  const [pressed, setPressed] = useState(false)
  return Section({
    padding: 12,
    display: 'flex',
    gap: 8,
    css: { '@media (min-width: 600px)': { padding: 20 } },
    children: [
      Span('Plant target', { key: 'text', fontWeight: 600 }),
      Span('exact', { key: 'exact', 'data-parity-exact': '', css: EXACT_CSS }),
      Input({ key: 'check', type: 'checkbox' }),
      Input({ key: 'field', placeholder: 'field' }),
      Button(pressed ? 'On' : 'Off', {
        key: 'toggle',
        type: 'button',
        'data-act': 'toggle',
        'aria-pressed': pressed,
        color: pressed ? 'rgb(0, 128, 0)' : 'rgb(128, 0, 0)',
        onClick: () => setPressed(p => !p),
      }),
    ],
  }).render() as ReactElement
}
