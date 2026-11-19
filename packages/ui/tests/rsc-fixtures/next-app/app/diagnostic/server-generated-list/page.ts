import { Div, Li, Node, Ul } from '@meonode/ui'

// A server component that generates its rows as rendered elements, used twice
// with 3 and 5 of them: one call site, two lengths, no keys. Every element here
// is created by a server component, so the server must still report the list.
function Items({ count }: { count: number }) {
  return Ul({ children: Array.from({ length: count }, (_, i) => Li({ children: `item ${i}` }).render()) }).render()
}

export default function Page() {
  return Div({
    'data-testid': 'server-generated-list',
    children: [Node(Items, { count: 3 }), Node(Items, { count: 5 })],
  }).render()
}
