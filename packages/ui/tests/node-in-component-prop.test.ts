// @vitest-environment jsdom
//
// A node handed to a component prop that the component renders as a React node:
// a Suspense `fallback`, a slot prop, a render target. The component renders the
// prop itself, so the node reaches React directly rather than through the
// render walk that resolves `children`.
import { Div, Node, Span, Suspense } from '@src/main.js'
import { NodeUtil } from '@src/util/node.util.js'
import { act, createElement, type ReactNode, use } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** A component written without MeoNode, rendering its prop where React expects a node. */
const Slot = ({ slot, children }: { slot?: ReactNode; children?: ReactNode }) => createElement('section', { 'data-testid': 'slot' }, slot, children)

/** Suspends for good, so its boundary shows the fallback. */
const never = new Promise<never>(() => {})
const Pending = () => use(never)

let container: HTMLElement | null = null

afterEach(() => {
  container?.remove()
  container = null
})

async function renderInDom(element: unknown): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(element as ReactNode))
  return container
}

describe('a node in a component prop the component renders', () => {
  it('renders in a slot prop on the client', async () => {
    const dom = await renderInDom(Node(Slot, { slot: Span('in the slot') }).render())
    expect(dom.querySelector('[data-testid=slot]')?.textContent).toBe('in the slot')
  })

  it('renders as a Suspense fallback on the client', async () => {
    const dom = await renderInDom(Suspense({ fallback: Div({ 'data-testid': 'fallback', children: 'loading' }), children: Node(Pending) }).render())
    expect(dom.querySelector('[data-testid=fallback]')?.textContent).toBe('loading')
  })

  it('renders in a slot prop on the server', () => {
    expect(renderToString(Node(Slot, { slot: Span('in the slot') }).render())).toContain('in the slot')
  })

  it('renders as a Suspense fallback on the server', () => {
    const html = renderToString(Suspense({ fallback: Div({ 'data-testid': 'fallback', children: 'loading' }), children: Node(Pending) }).render())
    expect(html).toContain('loading')
  })

  it('keeps its styles in a slot', async () => {
    const dom = await renderInDom(Node(Slot, { slot: Span('styled', { 'data-testid': 'styled', color: 'red' }) }).render())
    expect(getComputedStyle(dom.querySelector('[data-testid=styled]')!).color).toBe('rgb(255, 0, 0)')
  })

  it('renders each node of an array prop', async () => {
    const dom = await renderInDom(Node(Slot, { slot: [Span('a', { key: 'a' }), Span('b', { key: 'b' })] }).render())
    expect(dom.querySelector('[data-testid=slot]')?.textContent).toBe('ab')
  })

  describe("React's key check", () => {
    const keyWarnings = async (element: unknown) => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        await renderInDom(element)
        return spy.mock.calls.filter(call => String(call[0]).includes('unique "key" prop')).length
      } finally {
        spy.mockRestore()
      }
    }
    // React reports a missing key once per parent element name, so each test uses its own tag.
    it('asks no key of a node given as a positional child', async () => {
      const Positional = ({ slot }: { slot?: ReactNode }) => createElement('article', null, slot, 'after')
      expect(await keyWarnings(Node(Positional, { slot: Span('x') }).render())).toBe(0)
    })

    it('still asks a key of nodes in an array', async () => {
      const Listed = ({ slot }: { slot?: ReactNode }) => createElement('aside', null, slot)
      expect(await keyWarnings(Node(Listed, { slot: [Span('a'), Span('b')] }).render())).toBe(1)
    })

    it('takes the keys nodes in an array carry', async () => {
      const Keyed = ({ slot }: { slot?: ReactNode }) => createElement('nav', null, slot)
      expect(await keyWarnings(Node(Keyed, { slot: [Span('a', { key: 'a' }), Span('b', { key: 'b' })] }).render())).toBe(0)
    })
  })

  // A node renders as a node; it is not a component type, though React's lazy
  // shape that it carries is a valid element type to React.
  it('is still refused as an element type', () => {
    expect(() => Node(Span('x') as never)).toThrow('MeoNode UI instance provided')
  })

  it('is still ignored as an `as` target', () => {
    const html = renderToString(Div({ as: Span('x'), 'data-testid': 'host', children: 'a' } as never).render())
    expect(html).toMatch(/^<div[^>]*data-testid="host"/)
  })

  // A component that takes the node itself, to read it or hand it on, still gets the node.
  it('still hands the node itself to a component that takes one', async () => {
    let received: unknown
    const Receiver = ({ icon }: { icon?: unknown }) => {
      received = icon
      return Div({ children: icon as never }).render()
    }
    const icon = Span('icon')
    const dom = await renderInDom(Node(Receiver, { icon }).render())
    expect(received).toBe(icon)
    expect(NodeUtil.isNodeInstance(received)).toBe(true)
    expect(dom.textContent).toBe('icon')
  })
})
