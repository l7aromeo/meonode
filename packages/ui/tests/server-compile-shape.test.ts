// @vitest-environment node
//
// Where a server-compiled rule goes in the React Server Components layer, where
// nothing else will emit it: into the children of the topmost host above the
// element that uses it, in the same `.render()` call, as one trailing slot of
// hoisted `<style href precedence>` elements.
//
// A host renders every child it is given, so a rule placed there renders
// whenever anything inside that host does — whichever of its other subtrees a
// client component chooses not to render. The element carrying the rules stays
// the one element it would be without them, so a parent that clones or checks
// its child still receives it. Every render carries each rule it compiled; a
// render that is never shown takes only its own copy with it.
//
// The layer is recognised by the React build it loads, which has no `useState`;
// `react` is replaced with the client build minus `useState`, and a `cache` that
// memoizes for one test at a time, as the `react-server` build's does for one
// request.
import { cloneElement, createElement, Fragment, type ReactElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({ values: new Map<unknown, unknown>() }))

vi.mock('react', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>
  const { useState: _useState, ...serverBuild } = actual
  const cache = (fn: () => unknown) => () => {
    if (!request.values.has(fn)) request.values.set(fn, fn())
    return request.values.get(fn)
  }
  return { ...serverBuild, cache }
})

beforeEach(() => {
  request.values = new Map()
})

const { createNode, Div, Node, Svg } = await import('@src/main.js')

/** A plain server function component: its css reaches it as a compiled class name. */
function ServerRow(props: { children?: ReactNode; className?: string }) {
  return createElement('div', props)
}
const Row = createNode(ServerRow)

/** A component that renders its child untouched. */
function Pass({ children }: { children?: ReactNode }) {
  return createElement(Fragment, null, children)
}

const SHARED = { color: 'rgb(106, 4, 15)', padding: '4px 8px' }

type Element = ReactElement<{ children?: unknown; className?: string; href?: string; precedence?: string }>

const childrenOf = (element: Element) => {
  const children = element.props.children
  return (Array.isArray(children) ? children : [children]) as unknown[]
}
/** The trailing rules slot of a host carrying rules. */
const slotOf = (element: Element) => childrenOf(element).at(-1) as Element[]

const rows = () => [Row({ key: 'a', css: SHARED, children: 'a' }), Row({ key: 'b', css: SHARED, children: 'b' })]

describe('a server-compiled rule in the RSC layer', () => {
  it('is carried in the children of the host root, which stays that one element', () => {
    const root = Div({ key: 'list', id: 'rows', children: rows() }).render() as Element

    expect(root.type).toBe('div')
    expect(root.key).toBe('list')
    const slot = slotOf(root)
    expect(slot).toHaveLength(1)
    expect(slot[0].type).toBe('style')
    expect(slot[0].props.precedence).toBe('meonode')
  })

  it('goes after the host’s own children, leaving every element unwrapped', () => {
    const root = Div({ key: 'list', children: rows() }).render() as Element
    // Everything before the slot is the host's own. A list arrives as one array
    // child when the compiler has marked it and spread otherwise; the slot is
    // last either way.
    const elements = (childrenOf(root).slice(0, -1) as unknown[]).flat() as Element[]

    expect(elements.map(element => element.type)).toEqual([ServerRow, ServerRow])
    expect(elements.map(element => element.key)).toEqual(['a', 'b'])
    expect(slotOf(root)[0].props.href).toBe(elements[0].props.className)
  })

  it('is carried by every render that compiled it', () => {
    // No render can rely on another render's copy: either may be the one a client
    // component leaves unrendered.
    const first = Div({ children: rows() }).render() as Element
    const second = Div({ children: rows() }).render() as Element

    expect(slotOf(first)).toHaveLength(1)
    expect(slotOf(second)).toHaveLength(1)
  })

  it('reaches a host above a component, so the component still receives its child', () => {
    // An `asChild`-style parent injects props into the element it is given; the
    // rule rides on the host above it, not around the element.
    function Cloner({ children }: { children: ReactElement }) {
      return cloneElement(children, { 'data-cloned': 'yes' } as never)
    }
    const html = renderToString(Div({ children: Node(Cloner, { children: Row({ css: SHARED, children: 'x' }) }) }).render() as never)

    expect(html).toMatch(/<div[^>]*data-cloned="yes"[^>]*>x<\/div>/)
  })

  it('uses the nearest host below a root that cannot carry it, leaving that root unwrapped', () => {
    const root = Node(Pass, { key: 'pass', children: Div({ children: rows() }) }).render() as Element

    expect(root.type).toBe(Pass)
    const host = childrenOf(root)[0] as Element
    expect(host.type).toBe('div')
    expect(slotOf(host)).toHaveLength(1)
  })

  it('falls back to a keyed Fragment beside a root no host can carry it for', () => {
    // A server function component at the root, and nothing above it in this
    // render: the one case where the root is not the element it would otherwise
    // be. Pass the node as a child instead of its rendered element, and the rule
    // lands on a host in the parent's render.
    const root = Row({ key: 'alone', css: SHARED, children: 'x' }).render() as Element

    expect(root.type).toBe(Fragment)
    expect(root.key).toBe('alone')
    const [element, rules] = root.props.children as [Element, Element[]]
    expect(element.type).toBe(ServerRow)
    expect(rules[0].type).toBe('style')
  })

  it('does not place a rule inside svg, where a style would not be hoisted', () => {
    const root = Svg({ key: 'icon', children: Row({ css: SHARED, children: 'x' }) }).render() as Element

    expect(root.type).toBe(Fragment)
  })

  it('leaves a render with no server-compiled rule untouched', () => {
    const root = Div({ key: 'plain', children: 'x' }).render() as Element

    expect(root.type).toBe('div')
    expect(root.props.children).toBe('x')
  })
})
