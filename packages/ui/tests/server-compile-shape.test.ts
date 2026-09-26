// @vitest-environment node
//
// Where a server-compiled rule goes when no registry scope is open, and so
// nothing else will emit it: beside the root of the `.render()` call that
// compiled it, as a hoisted `<style href precedence>`, never around the element.
//
// Two properties rest on that. Every element keeps the type and position it has
// without the rule, so a parent that clones its child receives the element, and
// a refresh that moves a rule's first occurrence to another element cannot change
// any element's type — RSC output is reconciled against the live client tree on
// every refresh, and a type change at a keyed position is a remount. The
// end-to-end form of the second, a real `router.refresh()` counting mounts, is in
// the production build suite.
//
// `claimServerRule` is controlled here because outside the RSC layer the real one
// claims every time: `React.cache` memoises nothing there, so a real render never
// reaches the "already claimed" case.
import { cloneElement, createElement, Fragment, type ReactElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const claims: boolean[] = []
vi.mock('@src/util/server-emotion.util.js', async importOriginal => {
  const actual = await importOriginal<typeof import('@src/util/server-emotion.util.js')>()
  return { ...actual, claimServerRule: vi.fn(() => claims.shift() ?? true) }
})

const { createNode, Div, Node } = await import('@src/main.js')

/** A plain server function component: its css reaches it as a compiled class name. */
function ServerRow(props: { children?: ReactNode; className?: string }) {
  return createElement('div', props)
}
const Row = createNode(ServerRow)
const SHARED = { color: 'rgb(106, 4, 15)', padding: '4px 8px' }

type Element = ReactElement<{ children?: unknown; className?: string; href?: string; precedence?: string }>

/** Renders two rows sharing one rule under an unstyled root, telling the claims what to answer. */
const renderRows = (...answers: boolean[]) => {
  claims.push(...answers)
  const root = Div({
    key: 'list',
    id: 'rows',
    children: [Row({ key: 'a', css: SHARED, children: 'a' }), Row({ key: 'b', css: SHARED, children: 'b' })],
  }).render() as Element
  const [inner, styles] = root.props.children as [Element, Element[]]
  const rows = (inner.props.children as Element[]).flat() as Element[]
  return { root, inner, styles, rows }
}

beforeEach(() => {
  claims.length = 0
})

describe('a server-compiled rule with no registry scope open', () => {
  it('leaves every element unwrapped, whether or not it claimed the rule', () => {
    const { rows } = renderRows(true, false)

    expect(rows.map(row => row.type)).toEqual([ServerRow, ServerRow])
    expect(rows.map(row => row.key)).toEqual(['a', 'b'])
    expect(rows[0].props.className).toBe(rows[1].props.className)
  })

  it('wraps the render root in a keyed Fragment, root first', () => {
    const { root, inner } = renderRows(true, false)

    expect(root.type).toBe(Fragment)
    expect(root.key).toBe('list')
    expect(inner.type).toBe('div')
  })

  it('emits each rule this render claimed, and only those', () => {
    const claimed = renderRows(true, false).styles
    const unclaimed = renderRows(false, false).styles

    expect(claimed).toHaveLength(1)
    expect(claimed[0].type).toBe('style')
    expect(claimed[0].props.precedence).toBe('meonode')
    expect(claimed[0].props.href).toBe(renderRows(true, false).rows[0].props.className)
    expect(unclaimed).toEqual([])
  })

  it('keeps the same root shape when it claimed nothing', () => {
    // The wrapper depends on whether this render compiled a rule, not on whether
    // it was the first to claim one, so a refresh that moves the claim elsewhere
    // leaves this render's root the same type.
    const claimed = renderRows(true, false)
    const unclaimed = renderRows(false, false)

    expect(unclaimed.root.type).toBe(claimed.root.type)
    expect(unclaimed.root.key).toBe(claimed.root.key)
    expect(unclaimed.inner.type).toBe(claimed.inner.type)
  })

  it('returns the root unwrapped when the render compiled no rule', () => {
    const root = Div({ key: 'plain', id: 'plain', children: 'x' }).render() as Element

    expect(root.type).toBe('div')
  })

  it('lets a parent that clones its child reach the element', () => {
    // An `asChild`-style parent injects props into the element it is given; a
    // wrapper around the element would take them instead, silently.
    function Cloner({ children }: { children: ReactElement }) {
      return cloneElement(children, { 'data-cloned': 'yes' } as never)
    }
    const html = renderToString(Node(Cloner, { children: Row({ css: SHARED, children: 'x' }) }).render() as never)

    expect(html).toMatch(/<div[^>]*data-cloned="yes"[^>]*>x<\/div>/)
  })
})
