import { createElement, Suspense, type ReactNode } from 'react'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { createNode, Div, Node } from '@meonode/ui'
import { Committed, Counter, Reorder } from './client'

/** A plain server function component: its css reaches it as a compiled class name. */
function ServerRow(props: { children?: ReactNode; className?: string }) {
  return createElement('div', props)
}
const Row = createNode(ServerRow)

/** One rule shared by every row, so which row is its first occurrence can move. */
const SHARED = { color: 'rgb(106, 4, 15)', padding: '4px 8px' }

/**
 * One row, rendered by its own `.render()` call, so each row is a separate render
 * root and the request's claim on the shared rule moves between roots when the
 * order changes.
 */
function RowItem({ id }: { id: string }) {
  return Row({ css: SHARED, children: createElement(Counter, { id }) }).render()
}

/**
 * Three keyed rows sharing one server-compiled rule, reordered by a cookie so a
 * refresh moves the rule's first occurrence from `a` to `b`. `c` is last in both
 * orders and never first, which makes it the control: nothing about it changes,
 * so it should mount exactly once whatever the others do.
 */
async function Content() {
  await connection()
  const order = (await cookies()).get('order')?.value === 'b' ? ['b', 'a', 'c'] : ['a', 'b', 'c']
  return Div({
    'data-order': order.join(''),
    children: [
      createElement(Reorder, { key: 'reorder' }),
      createElement(Committed, { key: 'committed', order: order.join('') }),
      ...order.map(id => createElement(RowItem, { key: id, id })),
    ],
  }).render()
}

export default function Page() {
  return Node(Suspense, { fallback: null, children: Node(Content) }).render()
}
