// @vitest-environment jsdom
//
// A sole `0` or `''` child renders as React renders it, in a node and in a built
// element passed to a node, alone or in a list. React renders `<span>0</span>` for
// `createElement('span', null, 0)`, and a component given `''` or `[]` receives
// exactly that.
import { Div, Node, Span } from '@src/main.js'
import { cleanup, render } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, expect, it } from 'vitest'

afterEach(cleanup)

const html = (child: ReactNode) => render(Div({ children: child }).render()).container.innerHTML

/** The `children` a component received, and whether it received the prop at all. */
function received(child: (Seen: (props: { children?: unknown }) => null) => ReactNode) {
  let seen: { has: boolean; value: unknown } | undefined
  const Seen = (props: { children?: unknown }) => {
    seen = { has: 'children' in props, value: props.children }
    return null
  }
  render(Div({ children: child(Seen) }).render())
  return seen
}

it('keeps a sole `0`', () => {
  expect(html(createElement('span', null, 0))).toBe('<div><span>0</span></div>')
})

it('keeps a sole `0` in a list', () => {
  expect(html(createElement('span', null, [0]))).toBe('<div><span>0</span></div>')
})

it("hands a component a sole `''`", () => {
  expect(received(Seen => createElement(Seen, null, ''))).toEqual({ has: true, value: '' })
})

it('hands a component an empty list', () => {
  expect(received(Seen => createElement(Seen, null, []))).toEqual({ has: true, value: [] })
})

it("keeps a node's sole `0`", () => {
  expect(render(Span(0).render()).container.innerHTML).toBe('<span>0</span>')
})

it("keeps a node's sole `0` in a list", () => {
  expect(render(Div({ children: [0] }).render()).container.innerHTML).toBe('<div>0</div>')
})

it("hands a node's component a sole `''`", () => {
  let seen: { has: boolean; value: unknown } | undefined
  const Seen = (props: { children?: unknown }) => {
    seen = { has: 'children' in props, value: props.children }
    return null
  }
  render(Node(Seen, { children: '' }).render())
  expect(seen).toEqual({ has: true, value: '' })
})

it("keeps a node's sole `''`", () => {
  expect((Span('').render() as unknown as { props: { children?: unknown } }).props.children).toBe('')
})
