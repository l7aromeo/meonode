// Suspense and lazy, through a server render streamed from the shell on: the
// boundary resolves after the shell is sent, so its HTML and its hoisted
// styles arrive later as React streams them and are swapped in by React's
// script, then the page hydrates. The late content has a class the shell
// also uses and one of its own; each rule must be in the page once.
import { lazy, type ReactElement } from 'react'
import { Div, Node, Span, Suspense } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['dyn.suspense-lazy', 'env.streaming-late', 'place.style-props'],
  routes: ['NAMED', 'RUNTIME:not-extractable'],
  render: 'stream-late',
  routing: [
    { node: 'shell', route: 'NAMED' },
    { node: 'late', route: 'NAMED' },
  ],
}

/** Long enough that the shell is sent first, short enough for a quick page. */
const LATE_MS = 30

const Late = lazy(async () => {
  await new Promise(resolve => setTimeout(resolve, LATE_MS))
  return { default: (): ReactElement => Span('late content', { key: 'late', padding: 6, color: 'rgb(0, 100, 200)' }).render() as ReactElement }
})

export function App(): ReactElement {
  return Div({
    children: [
      Span('in the shell', { key: 'shell', padding: 6 }),
      Suspense({ key: 'boundary', fallback: Span('loading', { color: 'rgb(150, 150, 150)' }), children: Node(Late) }),
    ],
  } as never).render() as ReactElement
}
