// Runtime values in known properties (the VAR route): state in a width, a
// template with a runtime part, a number that gains px, and a runtime token
// path. Each click changes them.
import { useState, type ReactElement } from 'react'
import { Button, Div } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['value.runtime', 'value.template-runtime', 'dyn.state', 'place.style-props', 'env.ssr-hydrate'],
  routes: ['VAR', 'STATIC'],
  steps: [
    { name: 'step 1', click: '[data-act="grow"]' },
    { name: 'step 2', click: '[data-act="grow"]' },
  ],
}

const TOKEN_NAMES = ['primary', 'text', 'surface'] as const

export function App(): ReactElement {
  const [n, setN] = useState(1)
  return Div({
    display: 'grid',
    gap: n * 2,
    width: `${20 * n}%`,
    height: 30 + n,
    color: `theme.${TOKEN_NAMES[n % TOKEN_NAMES.length]}`,
    transform: `translateY(${n}px)`,
    children: Button('grow', { type: 'button', 'data-act': 'grow', padding: n, onClick: () => setN(v => v + 1) }),
  }).render() as ReactElement
}
