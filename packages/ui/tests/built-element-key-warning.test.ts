// @vitest-environment jsdom
//
// A list inside a built element passed to a node gets React's own missing-key
// warning, exactly as when React renders that element itself: the same text, and
// once per parent, as React dedupes it.
//
// React reports a missing key once per parent element name per process, so every
// case lists its children under parent tags no other case uses: one for React
// rendering the tree itself, one for the node, and the messages are compared with
// the tag names made the same. Only flat lists are used here; a nested array's
// report shares one budget across parents (see `nested-array-children.test.ts`).
import { Div, Span } from '@src/main.js'
import { act, createElement, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const h = createElement
let uid = 0

/** React's and MeoNode's console messages for one tree, rendered twice by `Author`. */
function messagesFor(tree: () => ReactNode): string[] {
  const messages: string[] = []
  const record = (...args: unknown[]) => {
    const [first, ...rest] = args.map(String)
    messages.push([(first ?? '').replace(/%s/g, () => rest.shift() ?? ''), ...rest].join(''))
  }
  vi.spyOn(console, 'error').mockImplementation(record)
  vi.spyOn(console, 'warn').mockImplementation(record)
  try {
    const Author = (_: { pass: number }) => tree()
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    act(() => root.render(h(Author, { pass: 1 })))
    act(() => root.render(h(Author, { pass: 2 })))
    act(() => root.unmount())
  } finally {
    vi.restoreAllMocks()
  }
  return messages
}

/**
 * Asserts that a node given `build(tag)` reports what React reports for
 * `reference(tag)` rendered itself, and that this is `count` messages.
 */
function sameAsReact(build: (tag: string) => ReactNode, count: number, reference: (tag: string) => ReactNode = build): void {
  const reactTag = `meo-react-${++uid}`
  const nodeTag = `meo-node-${uid}`
  const expected = messagesFor(() => h('div', null, reference(reactTag))).map(m => m.replaceAll(reactTag, 'TAG'))
  const got = messagesFor(() => Div({ children: build(nodeTag) as never }).render()).map(m => m.replaceAll(nodeTag, 'TAG'))
  expect(expected).toHaveLength(count)
  expect(got).toEqual(expected)
}

it('warns for an unkeyed list', () => {
  sameAsReact(tag => h(tag, null, [h('li', null, 'a'), h('li', null, 'b')]), 1)
})

it('warns for an unkeyed one-element list', () => {
  sameAsReact(tag => h(tag, null, [h('li', null, 'a')]), 1)
})

it('warns for a list where only some children have keys', () => {
  sameAsReact(tag => h(tag, null, [h('li', { key: 'a' }, 'a'), h('li', null, 'b')]), 1)
})

it('warns for a list inside an element inside the built element', () => {
  sameAsReact(tag => h('section', null, h(tag, null, [h('li', null, 'a'), h('li', null, 'b')])), 1)
})

it('warns for a list whose children hold nodes', () => {
  sameAsReact(
    tag => h(tag, null, [h('li', null, Span('a') as never), h('li', null, Span('b') as never)]),
    1,
    tag => h(tag, null, [h('li', null, Span('a').render()), h('li', null, Span('b').render())]),
  )
})

it('warns for a one-element list whose child holds a node', () => {
  sameAsReact(
    tag => h(tag, null, [h('li', null, Span('a') as never)]),
    1,
    tag => h(tag, null, [h('li', null, Span('a').render())]),
  )
})

it('stays silent for children holding nodes written out as arguments', () => {
  sameAsReact(
    tag => h(tag, null, h('li', null, Span('a') as never), h('li', null, Span('b') as never)),
    0,
    tag => h(tag, null, h('li', null, Span('a').render()), h('li', null, Span('b').render())),
  )
})

it('stays silent for children written out as arguments', () => {
  sameAsReact(tag => h(tag, null, h('li', null, 'a'), h('li', null, 'b')), 0)
})

it('stays silent for a keyed list', () => {
  sameAsReact(tag => h(tag, null, [h('li', { key: 'a' }, 'a'), h('li', { key: 'b' }, 'b')]), 0)
})

// Nodes are MeoNode's, not React's: React never sees them in the list, and a node
// in a `children` array is an authored child, which MeoNode keeps silent.
it('stays silent for nodes in a built list', () => {
  const tag = `meo-node-${++uid}`
  expect(messagesFor(() => Div({ children: h(tag, null, [Span('a'), Span('b')] as never) }).render())).toEqual([])
})

// A one-item list stays a list. React reconciles a sole child and the first item
// of a list in the same slot, so the item stays mounted when the list grows, as
// it does for the element rendered itself.
it('keeps the first item of a one-item list mounted when the list grows', () => {
  let mounts = 0
  const Item = () => {
    useEffect(() => {
      mounts++
    }, [])
    return h('li', null, 'item')
  }
  let size = 1
  const Author = (_: { pass: number }) =>
    Div({
      children: h(
        'ul',
        null,
        Array.from({ length: size }, (_, i) => h(Item, { key: i })),
      ),
    }).render()
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  act(() => root.render(h(Author, { pass: 1 })))
  size = 2
  act(() => root.render(h(Author, { pass: 2 })))
  act(() => root.unmount())
  expect(mounts).toBe(2)
})
