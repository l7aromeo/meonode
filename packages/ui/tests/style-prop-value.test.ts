// A value no style can be, under a prop MeoNode takes as a style (#161): a
// prop named like a CSS property, or the css prop, holding a DOM node, a React
// element, a node, a class instance, or an object that contains itself.
// Development builds report it with console.error, naming the prop, the node
// and the `props` escape, once per distinct message. Nothing else changes;
// production builds make no check.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshDevMode } from '@src/constant/common.const.js'
import { Component, createNode, Div, Node, Span } from '@src/main.js'
import { __resetStyleValueReport, __styleValueReportState } from '@src/util/factory-check.util.js'

let error: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  __resetStyleValueReport()
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  error.mockRestore()
  vi.unstubAllEnvs()
  refreshDevMode()
})

/** A component whose own props share CSS property names, as `Portal`'s `container` did. */
function Panel(props: { container?: unknown; content?: unknown; filter?: unknown; color?: unknown }) {
  return createElement('span', null, props.container ? 'has a container' : 'no container')
}
const Card = Component<{ color?: unknown }>(function Card() {
  return Span('card')
})
const Section = createNode('section')

const cyclic = () => {
  const value: Record<string, unknown> = { name: 'cyclic' }
  value.self = value
  return value
}

/** Each shape the issue names, under a CSS-named prop, with what the message must say the value is. */
const NOT_STYLES: Array<[shape: string, call: () => unknown, prop: string, node: string, kind: RegExp]> = [
  [
    'a host, a cyclic object',
    () => Div({ container: cyclic() } as never),
    'container.self',
    "'div'",
    /a reference back to `container`, an object that contains itself/,
  ],
  ['a component, a cyclic object', () => Node(Panel, { container: cyclic() } as never), 'container.self', "'Panel'", /a reference back to `container`/],
  ['a component, a DOM element', () => Node(Panel, { container: document.createElement('div') } as never), 'container', "'Panel'", /a DOM node \(DIV\)/],
  ['a host, a DOM element', () => Div({ content: document.createElement('p') } as never), 'content', "'div'", /a DOM node \(P\)/],
  ['a component, a class instance', () => Node(Panel, { filter: new URL('https://example.test/a') } as never), 'filter', "'Panel'", /an instance of URL/],
  ['a component, a React element', () => Node(Panel, { content: createElement('b') } as never), 'content', "'Panel'", /a React element/],
  ['a host, a node', () => Div({ content: Span('x') } as never), 'content', "'div'", /a node \(span\)/],
  ['a Component callable, a DOM element', () => Card({ color: document.createElement('i') } as never), 'color', 'Component(Card)', /a DOM node \(I\)/],
  ['a createNode factory, a class instance', () => Section({ order: new Date(0) } as never), 'order', "'section'", /an instance of Date/],
  [
    'a DOM element nested in a style object',
    () => Div({ color: { tone: document.createElement('span') } } as never),
    'color.tone',
    "'div'",
    /a DOM node \(SPAN\)/,
  ],
  [
    'the css prop, a DOM element',
    () => Div({ css: { '&:hover': { content: document.createElement('div') } } } as never),
    'css.&:hover.content',
    "'div'",
    /a DOM node \(DIV\)/,
  ],
]

describe('a value no style can be, under a prop taken as a style', () => {
  it.each(NOT_STYLES)('is reported in development for %s, naming the prop, the node and the escape', (_, call, prop, node, kind) => {
    expect(call).not.toThrow()
    expect(error).toHaveBeenCalledTimes(1)
    const message = String(error.mock.calls[0][0])
    expect(message).toMatch(
      new RegExp(`^\\[MeoNode\\] The \`${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\` style on ${node.replace(/[()]/g, '\\$&')} holds `),
    )
    expect(message).toMatch(kind)
    expect(message).toContain('props: {')
  })

  it.each(NOT_STYLES)('is not checked in production for %s', (_, call) => {
    vi.stubEnv('NODE_ENV', 'production')
    refreshDevMode()
    expect(call).not.toThrow()
    expect(error).not.toHaveBeenCalled()
  })

  it('reports before the render that cannot style it', () => {
    // The message comes first; the render then fails as it always has.
    const node = Node(Panel, { container: cyclic() } as never)
    expect(error).toHaveBeenCalledTimes(1)
    expect(() => renderToString(node.render())).toThrow(RangeError)
  })

  it('reports nothing for values a style can be', () => {
    Div({ color: 'red', padding: 4, margin: [1, 2], transition: ['opacity 1s', 'transform 1s'] } as never)
    Div({ color: { light: 'red', dark: 'blue' }, '&:hover': { color: 'blue' } } as never)
    Div({ color: (theme: unknown) => String(theme), css: { padding: 2, '& > *': { margin: [1, 2] } } } as never)
    Div({ width: undefined, height: null } as never)
    // A shared, not cyclic, plain object under two props.
    const shared = { tone: 'brand' }
    Div({ color: { a: shared, b: shared } } as never)
    // Through props, as the docs say.
    Node(Panel, { props: { container: document.createElement('div') } } as never)
    // A prop that is not a CSS property is the component's own.
    Node(Panel, { container: undefined, label: document.createElement('div') } as never)
    expect(error).not.toHaveBeenCalled()
  })
})

describe('repeated reports', () => {
  it('reports the same call once, however often it runs', () => {
    // A component calls its factories again on every render.
    const element = document.createElement('div')
    for (let i = 0; i < 20; i++) Node(Panel, { container: element } as never)
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('reports each distinct message once: another prop, node or kind of value', () => {
    for (let i = 0; i < 3; i++) {
      Node(Panel, { container: cyclic() } as never)
      Node(Panel, { content: cyclic() } as never)
      Div({ container: cyclic() } as never)
      Node(Panel, { container: new URL('https://example.test/') } as never)
    }
    expect(error).toHaveBeenCalledTimes(4)
  })

  it('never remembers more messages than the cap, and reports again once it has dropped them', () => {
    const cap = __styleValueReportState().cap
    let most = 0
    for (let i = 0; i < cap * 2 + 1; i++) {
      createNode(`x-element-${i}` as 'div')({ container: cyclic() } as never)
      most = Math.max(most, __styleValueReportState().reported)
    }
    expect(most).toBe(cap)
    expect(error).toHaveBeenCalledTimes(cap * 2 + 1)

    const first = () => createNode('x-element-0' as 'div')({ container: cyclic() } as never)
    first()
    expect(error).toHaveBeenCalledTimes(cap * 2 + 2)
    first()
    expect(error).toHaveBeenCalledTimes(cap * 2 + 2)
  })
})
