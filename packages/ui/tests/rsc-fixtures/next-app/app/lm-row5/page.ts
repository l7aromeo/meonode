import { Node, Span } from '@meonode/ui'
import { ListHostMarked } from '../_components/list-host-marked'
export default function Page() {
  // Outer carries NO marker; the wrapper's inner node does.
  return Node(ListHostMarked, {
    css: { color: 'rgb(0,0,255)', padding: '4px' },
    children: ['a', 'b', 'c'].map(id => Span(id, { 'data-testid': `r5-${id}` })),
  } as never).render()
}
