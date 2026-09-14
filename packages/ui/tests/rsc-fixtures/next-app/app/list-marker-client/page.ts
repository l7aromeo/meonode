'use client'
import { Div, Span } from '@meonode/ui'

const LIST_MARKER = '__meo$list'
const rows = ['alpha', 'beta', 'gamma']

/** Control for list-marker-server: same marked generated list, client side. */
export default function Page() {
  return Div({
    'data-testid': 'list-host-client',
    [LIST_MARKER]: 1,
    children: rows.map(id => Span(id, { 'data-testid': `crow-${id}` })),
  } as never).render()
}
