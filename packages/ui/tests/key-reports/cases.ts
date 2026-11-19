// React's missing-key reports for built elements placed as children, in the shapes
// an author writes, each with the reports React gives for it. React reports a
// missing key once per parent component name and process, and the nested arrays a
// node renders all share one, so each case runs in a test file of its own.
import { act, createElement, type ReactElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { Node, Span } from '@src/main.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** React's report of a child without a key, naming the author's component. */
const MISSING = 'missing key, passed from Author'
/** MeoNode's report of an unkeyed list whose length changed between renders. */
const GENERATED = 'generated list'

const kindOf = (message: string): string | undefined => {
  if (message.includes('unique "key" prop') && message.includes('It was passed a child from Author.')) return MISSING
  if (message.includes('[MeoNode] A `children` list without keys came from one call site')) return GENERATED
  return undefined
}

let seen: unknown
const Pass = ({ children }: { children?: ReactNode }) => {
  seen = children
  return children as ReactElement
}

/** The host each case lists its children in. */
const TAG = 'section'
/** How many rows a generated list has: 2 on the first render, 3 on the second. */
let rows = 2

/** Each case: the tree an author's component returns, the reports, and, for a component's children, React's mark on what it was given. */
const cases: Record<string, { tree: () => ReactNode; reports: string[]; seenValidated?: unknown }> = {
  unkeyedArray: { tree: () => Node(TAG, { children: [Span('a').render(), Span('b').render()] }).render(), reports: [] },
  unkeyedNested: { tree: () => Node(TAG, { children: ['h', [Span('a').render(), Span('b').render()]] }).render(), reports: [MISSING] },
  keyedNested: { tree: () => Node(TAG, { children: ['h', [Span('a', { key: 'a' }).render(), Span('b', { key: 'b' }).render()]] }).render(), reports: [] },
  single: { tree: () => Node(TAG, { children: Span('a').render() }).render(), reports: [] },
  componentSingle: { tree: () => Node(Pass, { children: Span('a', { id: 'x' }).render() }).render(), reports: [], seenValidated: 1 },
  componentArray: { tree: () => Node(Pass, { children: [Span('a').render(), Span('b').render()] }).render(), reports: [], seenValidated: [1, 1] },
  generated: { tree: () => Node(TAG, { children: Array.from({ length: rows }, (_, i) => Span(`r${i}`).render()) }).render(), reports: [GENERATED] },
  generatedNested: { tree: () => Node(TAG, { children: ['h', Array.from({ length: rows }, (_, i) => Span(`r${i}`).render())] }).render(), reports: [MISSING] },
  reusedSingleThenNested: {
    tree: () => {
      const element = Span('a').render()
      return Node('div', { children: [Node('p', { children: element }), Node(TAG, { children: ['h', [element]] })] }).render()
    },
    reports: [MISSING],
  },
  reusedNestedThenSingle: {
    tree: () => {
      const element = Span('a').render()
      return Node('div', { children: [Node(TAG, { children: ['h', [element]] }), Node('p', { children: element })] }).render()
    },
    reports: [MISSING],
  },
  reusedRawList: {
    tree: () => {
      const element = Span('a').render()
      return Node('div', { children: [Node('p', { children: element }), createElement(TAG, null, ['h', element])] }).render()
    },
    reports: [],
  },
  nestedOne: { tree: () => Node(TAG, { children: ['h', [Span('a').render()]] }).render(), reports: [MISSING] },
  reusedBothThenNested: {
    tree: () => {
      const [a, b] = [Span('a').render(), Span('b').render()]
      return Node('div', { children: [Node('p', { children: [a, b] }), Node(TAG, { children: ['h', [a, b]] })] }).render()
    },
    reports: [MISSING],
  },
  reusedBothNestedFirst: {
    tree: () => {
      const [a, b] = [Span('a').render(), Span('b').render()]
      return Node('div', { children: [Node(TAG, { children: ['h', [a, b]] }), Node('p', { children: [a, b] })] }).render()
    },
    reports: [MISSING],
  },
  styledReusedBoth: {
    tree: () => {
      const [a, b] = [Span('a', { margin: 1 }).render(), Span('b', { margin: 2 }).render()]
      return Node('div', { children: [Node('p', { children: [a, b] }), Node(TAG, { children: ['h', [a, b]] })] }).render()
    },
    reports: [MISSING],
  },
  styledNested: {
    tree: () => Node(TAG, { children: ['h', [Span('a', { margin: 1 }).render(), Span('b', { margin: 2 }).render()]] }).render(),
    reports: [MISSING],
  },
  styledGenerated: {
    tree: () => Node(TAG, { children: Array.from({ length: rows }, (_, i) => Span(`r${i}`, { margin: 3 }).render()) }).render(),
    reports: [GENERATED],
  },
  reusedGenerated: {
    tree: () => {
      const list = Array.from({ length: rows }, (_, i) => Span(`r${i}`).render())
      return Node('div', { children: [Node('p', { children: list[0] }), Node(TAG, { children: list })] }).render()
    },
    reports: [GENERATED],
  },
  reusedInComponent: {
    tree: () => {
      const [a, b] = [Span('a').render(), Span('b').render()]
      return Node('div', { children: [Node(Pass, { children: [a, b] }), Node(TAG, { children: ['h', [a, b]] })] }).render()
    },
    reports: [MISSING],
    seenValidated: [1, 1],
  },
}

const validated = (value: unknown): unknown => (Array.isArray(value) ? value.map(validated) : (value as { _store?: { validated?: number } })?._store?.validated)

/**
 * Defines the test for one case: an author's component renders its tree twice,
 * with 2 and then 3 rows in a generated list, and React's and MeoNode's reports
 * are those the case lists.
 */
export function keyReportCase(name: keyof typeof cases): void {
  const { tree, reports, seenValidated } = cases[name]
  it(`${name}: ${reports.length ? reports.join(', ') : 'no report'}`, () => {
    const messages: string[] = []
    const record = (...args: unknown[]) => {
      const [first, ...rest] = args.map(String)
      messages.push([(first ?? '').replace(/%s/g, () => rest.shift() ?? ''), ...rest].join(' '))
    }
    vi.spyOn(console, 'error').mockImplementation(record)
    vi.spyOn(console, 'warn').mockImplementation(record)
    seen = undefined
    rows = 2
    // The prop only makes the second render a new element.
    const Author = (_: { pass: number }) => tree()
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    act(() => root.render(createElement(Author, { pass: 1 })))
    rows = 3
    act(() => root.render(createElement(Author, { pass: 2 })))
    act(() => root.unmount())
    vi.restoreAllMocks()
    expect(messages.map(kindOf).filter(kind => kind !== undefined)).toEqual(reports)
    if (seenValidated !== undefined) expect(validated(seen)).toEqual(seenValidated)
  })
}
