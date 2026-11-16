// A node is accepted wherever the wrapped component takes a React node, the way
// `children` accepts one; a prop that takes something narrower does not widen.
import { createNode, Div, Node, type NodeInstance, Span, Suspense } from '@src/main.js'
import type { ReactElement, ReactNode } from 'react'
import { expectTypeOf } from 'vitest'

Suspense({ fallback: Div({ children: 'Loading…' }), children: Div({ children: 'content' }) })
Suspense({ fallback: 'Loading…', children: Div({ children: 'content' }) })

const Card = ({ title, footer, icon }: { title: ReactNode; footer?: ReactNode; icon: ReactElement; children?: ReactNode }) => {
  void title
  void footer
  void icon
  return null
}

Node(Card, { title: Span('Title'), footer: Div({ children: 'Footer' }), icon: Span('icon').render() })
Node(Card, { title: [Span('a'), 'b'], icon: Span('icon').render() })
createNode(Card)({ title: Span('Title'), icon: Span('icon').render() })

// `icon` takes an element, not any React node: a node there is still an error.
// @ts-expect-error a node is not a ReactElement
Node(Card, { title: 'Title', icon: Span('icon') })

// A prop typed for something else does not start accepting nodes.
const Counter = ({ count }: { count: number }) => {
  void count
  return null
}
// @ts-expect-error a node is not a number
Node(Counter, { count: Span('1') })

// A prop that already takes a node keeps exactly that type.
const Holder = ({ node }: { node: NodeInstance }) => {
  void node
  return null
}
Node(Holder, { node: Span('x') })
expectTypeOf<Parameters<typeof Holder>[0]['node']>().toEqualTypeOf<NodeInstance>()
