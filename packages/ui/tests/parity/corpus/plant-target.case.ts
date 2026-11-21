// The target of the planted failures in plants.mjs, and a case of its own: a
// section with static styles, a breakpoint and a toggle whose pressed state
// switches a static colour.
import { useState, type ReactElement } from 'react'
import { Button, Section, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.style-props', 'place.css', 'at.media', 'dyn.state', 'dyn.conditional', 'env.ssr-hydrate'],
  routes: ['STATIC', 'SWITCH'],
  breakpoints: [600],
  steps: [{ name: 'press', click: '[data-act="toggle"]' }],
}

export function App(): ReactElement {
  const [pressed, setPressed] = useState(false)
  return Section({
    padding: 12,
    display: 'flex',
    gap: 8,
    css: { '@media (min-width: 600px)': { padding: 20 } },
    children: [
      Span('Plant target', { key: 'text', fontWeight: 600 }),
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
