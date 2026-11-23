// A client render with no server HTML, as a client-only route mounts.
import type { ReactElement } from 'react'
import { Div, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['env.client-only', 'place.style-props', 'sel.pseudo-class'],
  routes: ['CARRIER', 'NAMED'],
  render: 'client',
}

export function App(): ReactElement {
  return Div({
    padding: 10,
    display: 'flex',
    gap: 6,
    css: { '&:hover': { backgroundColor: 'rgb(230, 250, 230)' } },
    children: [Span('client', { key: 'a', fontStyle: 'italic' }), Span('only', { key: 'b', fontWeight: 700 })],
  }).render() as ReactElement
}
