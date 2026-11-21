import { Node, Span } from '@meonode/ui'
import { ListHostMarked } from '../_components/list-host-marked'
export default function Page() {
  // Outer carries NO marker: its children are written out as an array literal,
  // which the plugin leaves unmarked too. The wrapper's inner node is marked.
  return Node(ListHostMarked, {
    css: { color: 'rgb(0,0,255)', padding: '4px' },
    children: [Span('a', { 'data-testid': 'r5-a' }), Span('b', { 'data-testid': 'r5-b' }), Span('c', { 'data-testid': 'r5-c' })],
  } as never).render()
}
