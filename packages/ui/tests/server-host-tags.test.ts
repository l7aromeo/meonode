// @vitest-environment node
//
// Host tags rendered in the RSC layer. There a host tag's css is compiled on the
// server into a class name and its rule travels beside the render root, the same
// path a server function component takes, instead of becoming a `StyledRenderer`
// client element whose whole css object would be serialised into the flight
// payload.
//
// The RSC layer is recognised by the React build it loads: the `react-server`
// build has no `useState`. `react` is replaced here with the client build minus
// `useState`, which is that shape; the companion file renders the same tags
// without the replacement, where they keep `StyledRenderer`. The replacement's
// `cache` memoizes for one test at a time, as the `react-server` build's does
// for one request.
import { cloneElement, Fragment, type ReactElement } from 'react'
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

const { createNode, Div, Img, ThemeProvider } = await import('@src/main.js')

type Element = ReactElement<{ children?: unknown; className?: string; href?: string; precedence?: string; 'data-cloned'?: string }>

const childrenOf = (element: Element) => {
  const children = element.props.children
  return (Array.isArray(children) ? children : [children]) as unknown[]
}
/** The trailing rules slot of a host carrying rules. */
const slotOf = (element: Element) => childrenOf(element).at(-1) as Element[]

const HOVERABLE = { color: 'rgb(106, 4, 15)', '&:hover': { color: 'rgb(0, 0, 255)' }, '@media (min-width: 600px)': { padding: 8 } }

describe('a host tag in the RSC layer', () => {
  it('renders as the element itself, with a server-compiled class and its rule in its children', () => {
    const root = Div({ key: 'row', css: HOVERABLE, children: 'x' }).render() as Element

    expect(root.type).toBe('div')
    expect(root.key).toBe('row')
    expect(root.props.className).toMatch(/^meonode-css-/)
    expect(slotOf(root)[0].props.href).toBe(root.props.className)
  })

  it('emits its rule, pseudo-classes and at-rules included', () => {
    const root = Div({ css: HOVERABLE, children: 'x' }).render() as Element
    const [style] = slotOf(root)
    const className = root.props.className as string

    expect(style.props.precedence).toBe('meonode')
    expect(style.props.children).toContain(`.${className}:hover{color:rgb(0, 0, 255);}`)
    expect(style.props.children).toMatch(new RegExp(`@media \\(min-width: 600px\\)\\{\\.${className}\\{padding:8px;\\}\\}`))
  })

  it('resolves theme tokens to css variables', () => {
    const provider = ThemeProvider({
      tokens: { colors: { primary: 'red' } },
      modes: ['light', 'dark'],
      defaultMode: 'light',
      children: Div({ id: 'token', css: { color: 'theme.colors.primary' }, children: 'x' }),
    } as never)
    const html = JSON.stringify(provider.render(), (_key, value) => (typeof value === 'function' ? undefined : value))

    expect(html).toContain('color:var(--meonode-theme-colors-primary)')
  })
})

describe('a parent that clones its child', () => {
  function Cloner({ children }: { children: Element }) {
    return cloneElement(children, { 'data-cloned': 'yes' })
  }
  const Slot = createNode(Cloner)

  it('reaches a styled host passed as a node', () => {
    const root = Slot({ children: Div({ css: HOVERABLE, children: 'x' }) }).render() as Element
    const cloned = Cloner(root.props as never) as Element

    expect(cloned.type).toBe('div')
    expect(cloned.props['data-cloned']).toBe('yes')
  })

  it('reaches a styled host passed as its rendered element', () => {
    // The host carries its own rule, so its render is still the one element.
    const cloned = Cloner({ children: Div({ css: HOVERABLE, children: 'x' }).render() as Element }) as Element

    expect(cloned.type).toBe('div')
    expect(cloned.props['data-cloned']).toBe('yes')
  })

  it('reaches the fallback Fragment, not the element, for a rendered root that cannot carry its rule', () => {
    // A void element holds no children, so its render travels inside a Fragment
    // with its rule beside it, and a parent cloning that result injects into the
    // Fragment. Pass the node itself as the child instead, and the rule lands on
    // a host in the parent's render.
    const rendered = Img({ css: HOVERABLE, alt: '' }).render() as Element
    const cloned = Cloner({ children: rendered }) as Element

    expect(rendered.type).toBe(Fragment)
    expect(cloned.type).toBe(Fragment)
    expect((cloned.props.children as Element[])[0].props['data-cloned']).toBeUndefined()
  })

  it('reaches a void element passed as a node', () => {
    const root = Div({ children: Slot({ children: Img({ css: HOVERABLE, alt: '' }) }) }).render() as Element
    const slotParent = childrenOf(root)[0] as Element
    const cloned = Cloner(slotParent.props as never) as Element

    expect(cloned.type).toBe('img')
    expect(cloned.props['data-cloned']).toBe('yes')
  })
})

describe('a className passed into a styled host in the RSC layer', () => {
  /** Styles itself and passes the caller's `className` through, as a server component would. */
  function Card({ className, children }: { className?: string; children?: string }) {
    return Div({ className, color: 'rgb(0, 128, 128)', children }).render() as Element
  }
  const CardNode = createNode(Card)

  /** Renders `CardNode(props)` and then the `Card` it produces, the way React would. */
  const renderCard = (props: Record<string, unknown>) => {
    const root = CardNode({ ...props, children: 'conflict' }).render() as Element
    const card = (root.type === Fragment ? childrenOf(root)[0] : root) as ReactElement<{ className?: string; children?: string }>
    return Card(card.props)
  }
  const ruleOf = (element: Element) => (slotOf(element)[0].props as { children: string }).children

  it('overrides the host’s own css, composed into one class as on the client', () => {
    const div = renderCard({ css: { color: 'rgb(255, 165, 0)' } })
    const classes = (div.props.className as string).split(' ')

    expect(classes).toHaveLength(1)
    expect(classes[0]).toMatch(/^meonode-css-/)
    const rule = ruleOf(div)
    expect(rule.startsWith(`.${classes[0]}{`)).toBe(true)
    expect(rule.lastIndexOf('color:rgb(255, 165, 0)')).toBeGreaterThan(rule.lastIndexOf('color:rgb(0, 128, 128)'))
  })

  it('keeps a class it did not compile, untouched and ahead of its own', () => {
    const div = renderCard({ className: 'utility' })

    expect(div.props.className).toMatch(/^utility meonode-css-[a-z0-9]+$/)
    expect(ruleOf(div)).not.toContain('rgb(255, 165, 0)')
  })

  it('names its rule by its own class alone, so the rule is one element whatever classes sit beside it', () => {
    const first = renderCard({ className: 'utility' })
    const second = renderCard({ className: 'other-utility' })
    const [firstRule] = slotOf(first)
    const [secondRule] = slotOf(second)

    expect(firstRule.props.href).toMatch(/^meonode-css-[a-z0-9]+$/)
    expect(firstRule.props.href).toBe((first.props.className as string).split(' ').at(-1))
    expect(secondRule).toBe(firstRule)
  })
})
