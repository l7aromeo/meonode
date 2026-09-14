import { Node, Span } from '@meonode/ui'
import { ListHostMarked } from '../_components/list-host-marked'
export default function Page() {
  return Node(ListHostMarked, {
    css: { color: 'rgb(0,0,255)', padding: '4px' },
    ['__meo$list']: 1,
    children: ['a', 'b', 'c'].map(id => Span(id, { 'data-testid': `r3-${id}` })),
  } as never).render()
}
