// Suspense and lazy, through a streamed server render that waits for every
// boundary, then hydration.
import { lazy, type ReactElement } from 'react'
import { Div, Node, Span, Suspense } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['dyn.suspense-lazy', 'env.streaming', 'place.style-props'],
  routes: ['CARRIER', 'RUNTIME:not-extractable'],
  render: 'stream',
}

const Late = lazy(async () => ({
  default: (): ReactElement => Span('lazy content', { color: 'rgb(0, 100, 200)', padding: 6 }).render() as ReactElement,
}))

export function App(): ReactElement {
  return Div({
    padding: 4,
    children: Suspense({ fallback: Span('loading', { color: 'rgb(150, 150, 150)' }), children: Node(Late) }),
  } as never).render() as ReactElement
}
