// @vitest-environment jsdom
//
// Every shape in which a component can receive a node outside `children`. A node
// is a React lazy value as well as a node, so React renders it wherever the
// receiver renders it, and a receiver that wants the node itself gets the node.
// Turning nodes into elements before the receiver sees them would also render
// S8 and S9, but it breaks S2 and S3, which take the node itself, and still
// leaves S5 to S7 unrendered.
//
// The types accept a node where a component prop is typed `ReactNode` (S8, S9 and
// the slot props in node-in-react-node-prop.test-d.ts). A render prop's return,
// a nested object and a `Component` call's props keep their declared types, so
// S4 to S7 cast.
import { Component, Div, Node, Span, Suspense } from '@src/main.js'
import { NodeUtil } from '@src/util/node.util.js'
import { createElement, type ReactNode, use } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

const never = new Promise<never>(() => {})
const Pending = () => use(never)

describe('a node a component receives outside children', () => {
  it('S1 renders when the receiver puts it in a node’s children', () => {
    const Wrapper = (props: { childNode: unknown }) => Div({ children: props.childNode as never }).render()
    expect(renderToString(Node(Wrapper, { childNode: Span('s1') }).render())).toContain('s1')
  })

  it('S2 is still the node when the receiver calls its render()', () => {
    const Renders = (props: { icon: { render: () => ReactNode } }) => createElement('i', null, props.icon.render())
    expect(renderToString(Node(Renders as never, { icon: Span('s2') } as never).render())).toContain('s2')
  })

  it('S3 is still the node when the receiver inspects it', () => {
    const Inspects = (props: { icon: unknown }) =>
      createElement('i', null, NodeUtil.isNodeInstance(props.icon) ? `node:${String((props.icon as { element: unknown }).element)}` : 'not-a-node')
    expect(renderToString(Node(Inspects, { icon: Span('x') }).render())).toContain('node:span')
  })

  it('S4 renders when the receiver is a Component', () => {
    const Hoc = Component<{ icon: ReactNode }>(props => Div({ children: props.icon as never }))
    expect(renderToString(Hoc({ icon: Span('s4') as never }))).toContain('s4')
  })

  it('S5 renders when a render prop returns it', () => {
    const List = ({ renderItem }: { renderItem: () => ReactNode }) => createElement('ul', null, createElement('li', null, renderItem()))
    expect(renderToString(Node(List, { renderItem: () => Span('s5') as never }).render())).toContain('s5')
  })

  it('S6 renders inside a nested object prop', () => {
    const Slots = ({ slots }: { slots: { icon: ReactNode } }) => createElement('i', null, slots.icon)
    expect(renderToString(Node(Slots, { slots: { icon: Span('s6') as never } }).render())).toContain('s6')
  })

  it('S7 renders when passed through createElement rather than Node()', () => {
    const Slot = ({ slot }: { slot: ReactNode }) => createElement('i', null, slot)
    expect(renderToString(createElement(Slot, { slot: Span('s7') as never }))).toContain('s7')
  })

  it('S8 renders as a Suspense fallback', () => {
    expect(renderToString(Suspense({ fallback: Div({ children: 's8' }), children: Node(Pending) }).render())).toContain('s8')
  })

  it('S9 renders each node of an array prop', () => {
    const Slot = ({ slot }: { slot: ReactNode }) => createElement('i', null, slot)
    const html = renderToString(Node(Slot, { slot: [Span('s9a', { key: 'a' }), Span('s9b', { key: 'b' })] }).render())
    expect(html).toContain('s9a')
    expect(html).toContain('s9b')
  })
})
