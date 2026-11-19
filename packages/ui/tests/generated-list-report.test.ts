// @vitest-environment jsdom
//
// The development report for an unkeyed list generated at runtime, in an app
// built without the compiler. A call site that hands over unkeyed `children`
// arrays of different lengths is producing them at runtime; one that always
// hands over the same length may have written them out, and is never reported.
import { Div, For, Li, Node, Span, Ul, createNode, type NodeElement, type NodeInstance } from '@src/main.js'
import { refreshDevMode } from '@src/constant/common.const.js'
import { __generatedListState, __resetGeneratedListReport, observeChildren } from '@src/util/generated-list.util.js'
import { act, cleanup, render } from '@testing-library/react'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement, StrictMode, useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

const REPORT = '[MeoNode] A `children` list without keys'

/**
 * The compiled run puts the compiler's marker on the call sites written in this
 * file that a factory from `@meonode/ui` takes a list at. The marker reports
 * those, so there the runtime must stay silent.
 */
const COMPILED = process.env.MEONODE_COMPILED === '1'

let warn: MockInstance<typeof console.warn>

beforeEach(() => {
  __resetGeneratedListReport()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  refreshDevMode()
  warn.mockRestore()
})

const reports = () => warn.mock.calls.filter(([message]) => typeof message === 'string' && message.startsWith(REPORT))

/** One call site, evaluated once per length: what a `.map()` over changing data does. */
const rows = (count: number) => Ul({ children: Array.from({ length: count }, (_, i) => Li({ children: `row ${i}` })) })

/**
 * Evaluates `build` once per count from one line, the way a component re-runs
 * the same code on every render. Two calls on two lines are two call paths.
 */
const evaluate = (build: (count: number) => unknown, counts: number[]) => {
  for (const count of counts) build(count)
}

describe('a call site whose unkeyed list changes length', () => {
  it('is reported once, with both lengths and the call site', () => {
    evaluate(rows, [2, 3, 4])
    expect(reports()).toHaveLength(COMPILED ? 0 : 1)
    if (COMPILED) return
    const [message, site] = reports()[0]
    expect(message).toContain('with 2, then 3 items')
    expect(site).toBeInstanceOf(Error)
    // The printed stack starts in this file, at the factory call that took the list.
    expect(String((site as Error).stack).split('\n')[1]).toContain('generated-list-report.test.ts')
  })

  it("names the author's frame, not the frames of a factory from an installed package", async () => {
    // The shape of `createMuiNode`, loaded from a `node_modules` path as an installed package is.
    const dir = mkdtempSync(join(tmpdir(), 'meonode-list-'))
    try {
      const file = join(dir, 'node_modules', 'factory-lib', 'index.mjs')
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, 'export const wrap = (node, element) => props => node(element, { ...props })\n')
      const { wrap } = (await import(pathToFileURL(file).href)) as { wrap: (node: typeof Node, element: string) => (props: object) => unknown }
      const Stack = wrap(Node, 'div')
      evaluate(count => Stack({ children: Array.from({ length: count }, (_, i) => Span(`item ${i}`)) }), [1, 2])
      expect(reports()).toHaveLength(1)
      const lines = String((reports()[0][1] as Error).stack).split('\n')
      expect(lines[1]).toContain('generated-list-report.test.ts')
      expect(lines.some(line => line.includes('factory-lib'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('is reported for a children-first factory', () => {
    const spans = (count: number) => Span(Array.from({ length: count }, (_, i) => Span(`item ${i}`)))
    evaluate(spans, [1, 2])
    expect(reports()).toHaveLength(1)
  })

  it('is reported when the list also holds a nested list', () => {
    const mixed = (count: number) => Div({ children: [...Array.from({ length: count }, (_, i) => Span(`item ${i}`)), [Span('nested')]] })
    evaluate(mixed, [1, 2])
    expect(reports()).toHaveLength(COMPILED ? 0 : 1)
  })

  it('is reported when one component renders a list of 3 in one place and 5 in another', () => {
    function Items({ count }: { count: number }) {
      return Ul({ children: Array.from({ length: count }, (_, i) => Li({ children: `item ${i}` })) }).render()
    }
    render(Div({ children: [Node(Items, { count: 3 }), Node(Items, { count: 5 })] }).render())
    expect(reports()).toHaveLength(COMPILED ? 0 : 1)
  })

  it('is reported once under StrictMode, from the first render that changed length', () => {
    let add = () => {}
    function Items() {
      const [count, setCount] = useState(2)
      add = () => setCount(c => c + 1)
      return Ul({ children: Array.from({ length: count }, (_, i) => Li({ children: `item ${i}` })) }).render()
    }
    render(createElement(StrictMode, null, Node(Items).render()))
    act(() => add())
    act(() => add())
    expect(reports()).toHaveLength(COMPILED ? 0 : 1)
    if (COMPILED) return
    expect(reports()[0][0]).toContain('with 2, then 3 items')
  })
})

describe('lists that are not reported', () => {
  it('an array literal with a conditional slot, whichever way the condition goes', () => {
    const card = (open: boolean) => Div({ children: [Span('title'), open && Span('body')] })
    evaluate(count => card(count === 1), [1, 0, 1])
    expect(reports()).toHaveLength(0)
  })

  it('a generated list that always has the same length', () => {
    evaluate(rows, [3, 3])
    expect(reports()).toHaveLength(0)
  })

  it('a keyed list, a `For` list, a single child, a function child and a nested list', () => {
    const keyed = (count: number) => Ul({ children: Array.from({ length: count }, (_, i) => Li({ key: i, children: `row ${i}` })) })
    evaluate(keyed, [2, 3])
    const each = (count: number) =>
      Ul({
        children: For(
          Array.from({ length: count }, (_, i) => i),
          i => Li({ children: `row ${i}` }),
        ),
      })
    evaluate(each, [2, 3])
    const single = (text: string) => Div({ children: Span(text) })
    evaluate(count => single(String(count)), [1, 2])
    const fn = () => Div({ children: () => Span('rendered') })
    evaluate(fn, [1, 2])
    const nested = (count: number) => Div({ children: [Span('heading'), Array.from({ length: count }, (_, i) => Span(`item ${i}`))] })
    evaluate(nested, [1, 4])
    expect(reports()).toHaveLength(0)
  })

  it('a list the compiler marked, which its own marker reports', () => {
    const marked = (count: number) => Ul({ __meo$: 3, __meo$list: 1, children: Array.from({ length: count }, (_, i) => Li({ children: `row ${i}` })) } as never)
    evaluate(marked, [2, 3])
    // A children-first call carries the marker in the props object the compiler adds.
    const markedFirst = (count: number) =>
      Span(
        Array.from({ length: count }, (_, i) => Span(`item ${i}`)),
        { __meo$: 3, __meo$list: 1 } as never,
      )
    evaluate(markedFirst, [2, 3])
    expect(reports()).toHaveLength(0)
  })

  it('typed children a helper passes through to an inner element, from callers that wrote 2 and 3', () => {
    const Card = ({ children }: { children: NodeElement[] }) => Div({ padding: 8, children })
    Card({ children: [Span('a'), Span('b')] })
    Card({ children: [Span('a'), Span('b'), Span('c')] })
    expect(reports()).toHaveLength(0)
  })

  it('typed children a helper re-wraps with a sibling of its own, from callers that wrote 2 and 3', () => {
    const Card = ({ children }: { children: NodeElement[] }) => Div({ children: [...children, Span('footer')] })
    Card({ children: [Span('a'), Span('b')] })
    Card({ children: [Span('a'), Span('b'), Span('c')] })
    expect(reports()).toHaveLength(0)
  })

  it('typed children a component hands on as `props.children`, from callers that wrote 2 and 3', () => {
    function Card({ children }: { children?: ReactNode }) {
      return Div({ padding: 8, children: children as NodeElement }).render()
    }
    function CardWithFooter({ children }: { children?: ReactNode }) {
      return Div({ children: [...(children as NodeElement[]), Span('footer')] }).render()
    }
    render(
      Div({
        children: [
          Node(Card, { children: [Span('a'), Span('b')] }),
          Node(Card, { children: [Span('a'), Span('b'), Span('c')] }),
          Node(CardWithFooter, { children: [Span('a'), Span('b')] }),
          Node(CardWithFooter, { children: [Span('a'), Span('b'), Span('c')] }),
        ],
      }).render(),
    )
    expect(reports()).toHaveLength(0)
  })

  it('typed children a component takes in another prop and re-wraps with a sibling of its own', () => {
    function Layout({ sidebar }: { sidebar: NodeElement[] }) {
      return Div({ children: [...sidebar, Span('footer')] }).render()
    }
    render(
      Div({
        children: [Node(Layout, { sidebar: [Span('a'), Span('b')] }), Node(Layout, { sidebar: [Span('a'), Span('b'), Span('c')] })],
      }).render(),
    )
    expect(reports()).toHaveLength(0)
  })

  it('typed children a component takes in another prop and renders as `children`', () => {
    function Layout({ sidebar }: { sidebar: NodeElement[] }) {
      return Div({ children: sidebar }).render()
    }
    render(
      Div({
        children: [Node(Layout, { sidebar: [Span('a'), Span('b')] }), Node(Layout, { sidebar: [Span('a'), Span('b'), Span('c')] })],
      }).render(),
    )
    expect(reports()).toHaveLength(0)
  })

  it('rendered elements a component takes in another prop and renders as `children`', () => {
    function Layout({ sidebar }: { sidebar: ReactNode[] }) {
      return Div({ children: sidebar as NodeElement[] }).render()
    }
    render(
      Div({
        children: [
          Node(Layout, { sidebar: [Span('a').render(), Span('b').render()] }),
          Node(Layout, { sidebar: [Span('a').render(), Span('b').render(), Span('c').render()] }),
        ],
      }).render(),
    )
    expect(reports()).toHaveLength(0)
  })

  it('typed children through a library-style factory wrapper shared by every caller', () => {
    // The shape of `createMuiNode`: one wrapper function between the author's
    // call and `Node`, the same frame for every caller.
    const wrap =
      (element: string) =>
      (props: Record<string, unknown>): NodeInstance =>
        Node(element as 'div', { ...props })
    const Stack = wrap('div')
    Stack({ children: [Span('a'), Span('b')] })
    Stack({ children: [Span('a'), Span('b'), Span('c')] })
    const Box = createNode('section')
    Box({ children: [Span('a'), Span('b')] })
    Box({ children: [Span('a'), Span('b'), Span('c')] })
    expect(reports()).toHaveLength(0)
  })
})

describe('call sites when the factory frame is missing', () => {
  // Safari drops the frame of a function that returns a call (proper tail
  // calls), so the frame the stack is cut at can be absent.
  const absent = () => undefined
  const list = (count: number) => ({ children: Array.from({ length: count }, (_, i) => Span(`item ${i}`)) })

  it('still tells two call sites apart', () => {
    observeChildren('ul', list(2), absent)
    observeChildren('ul', list(3), absent)
    expect(reports()).toHaveLength(0)
  })

  it('still reports one call site that changes length, naming it', () => {
    evaluate(count => observeChildren('ul', list(count), absent), [2, 3])
    expect(reports()).toHaveLength(1)
    expect(String((reports()[0][1] as Error).stack)).toContain('generated-list-report.test.ts')
  })
})

describe('bounds', () => {
  it('remembers a bounded number of call sites', () => {
    // Code evaluated at a new position each time, as a reloaded module is: every
    // body puts its call one line lower, so each is a call site of its own. The
    // lengths alternate, so the group has seen two and every call is identified.
    for (let i = 0; i < 2500; i++) {
      const rows = i % 2 ? "[Li({ children: 'a' }), Li({ children: 'b' })]" : "[Li({ children: 'a' })]"
      const make = new Function('Ul', 'Li', '\n'.repeat(i) + `return Ul({ children: ${rows} })`) as (ul: typeof Ul, li: typeof Li) => unknown
      make(Ul, Li)
    }
    const { callSites } = __generatedListState()
    expect(callSites).toBeGreaterThan(0)
    expect(callSites).toBeLessThanOrEqual(2000)
  })

  it('remembers a bounded number of groups', () => {
    // A reloaded module defines its components again, as new functions.
    for (let i = 0; i < 2500; i++) {
      const Row = () => null
      Node(Row, { children: [Span('a')] })
    }
    const { groups } = __generatedListState()
    expect(groups).toBeGreaterThan(0)
    expect(groups).toBeLessThanOrEqual(2000)
  })

  it('does nothing in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    refreshDevMode()
    const capture = vi.spyOn(Error, 'captureStackTrace')
    evaluate(rows, [2, 3])
    expect(capture).not.toHaveBeenCalled()
    expect(reports()).toHaveLength(0)
    capture.mockRestore()
  })
})
