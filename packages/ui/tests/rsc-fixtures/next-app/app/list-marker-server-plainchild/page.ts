import { Node, Span } from '@meonode/ui'
import { ListHostPlain } from '../_components/list-host-plain'
const LIST_MARKER = '__meo$list'
export default function Page() {
  return Node(ListHostPlain, {
    css: { color: 'rgb(0, 0, 255)', padding: '4px' },
    [LIST_MARKER]: 1,
    children: ['alpha', 'beta', 'gamma'].map(id => Span(id, { 'data-testid': `prow-${id}` })),
  } as never).render()
}
