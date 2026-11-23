// Intrinsic sizing keywords that arrive at runtime in sizing properties. These
// take a variable, and the extracted rule has no prefixed forms; the runtime
// path writes Emotion's -webkit-/-moz- forms beside the plain one. Each step
// moves to the next keyword.
import { useState, type ReactElement } from 'react'
import { Button, Div, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['value.sizing-keyword', 'value.runtime', 'value.template-runtime', 'dyn.state', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'TEMPLATE'],
  routing: [
    { node: 'width', route: 'CARRIER' },
    { node: 'min-height', route: 'TEMPLATE' },
  ],
  steps: [
    { name: 'max-content', click: '[data-act="next"]' },
    { name: 'min-content', click: '[data-act="next"]' },
    { name: 'fit-content again', click: '[data-act="next"]' },
  ],
}

const KEYWORDS = ['fit-content', 'max-content', 'min-content'] as const

export function App(): ReactElement {
  const [n, setN] = useState(0)
  const keyword = KEYWORDS[n % KEYWORDS.length]
  return Div({
    children: [
      Button('next', { key: 'next', type: 'button', 'data-act': 'next', onClick: () => setN(v => v + 1) }),
      Div({ key: 'width', width: `${keyword}`, children: Span('sized by its content', { key: 's' }) }),
      Div({ key: 'min-height', minHeight: `${keyword}`, children: [Span('a', { key: 'a' }), Span('b', { key: 'b' })] }),
    ],
  } as never).render() as ReactElement
}
