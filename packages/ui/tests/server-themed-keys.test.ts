// @vitest-environment node
//
// A theme token in a `css` key — an at-rule condition or a selector — needs the
// theme's concrete value: `var()` is invalid there. A server component cannot read
// the ThemeProvider above it, so in the React Server Components layer the part of
// the css from the first such key on is handed to `ThemedRule`, which resolves it
// where the theme is. No rule written on the server may ever carry the token.
//
// `react` is replaced with the client build minus `useState`, the shape of the
// `react-server` build, with a `cache` that memoizes for one test at a time.
import { createElement, Fragment, type ReactElement } from 'react'
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

const { createChildrenFirstNode, createNode, Div, Node } = await import('@src/main.js')
const { ThemedRule } = await import('@src/components/styled-renderer.client.js')

type Element = ReactElement<{ children?: unknown; css?: Record<string, unknown>; className?: string }>

/** Every element anywhere in a rendered tree, in document order. */
function elements(node: unknown, found: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, found)
    return found
  }
  if (!node || typeof node !== 'object' || !('props' in node)) return found
  found.push(node as Element)
  elements((node as Element).props.children, found)
  return found
}
const inTree = (root: Element) => elements(root.type === Fragment ? root : createElement(Fragment, null, root))
const serverRules = (root: Element) => inTree(root).filter(e => e.type === 'style').map(e => e.props.children as string)
const themedRules = (root: Element) => inTree(root).filter(e => e.type === ThemedRule) as ReactElement<{ className: string; css: Record<string, unknown> }>[]
/** The class of the element carrying `marker` as its text. */
const classOf = (root: Element, marker: string) =>
  inTree(root).find(e => e.props.children === marker || (Array.isArray(e.props.children) && e.props.children.includes(marker)))?.props.className

/** A plain server function component, given `css` by its caller. */
function Card({ className, children }: { className?: string; children?: string }) {
  return createElement('div', { className }, children)
}
const CardNode = createNode(Card)
const Label = createChildrenFirstNode('span')

const KEYS = [
  ['@media', '@media (width >= theme.breakpoint.wide)'],
  ['@container', '@container (min-width: theme.breakpoint.wide)'],
  ['@supports', '@supports (gap: theme.spacing.md)'],
  ['a selector', '&[data-size="theme.size.lg"]'],
] as const

const SHAPES: ReadonlyArray<readonly [string, (css: Record<string, unknown>, text: string) => Element]> = [
  ['a host tag', (css, text) => Div({ css: css as never, children: text }).render() as Element],
  ['a host tag with an `as` swap', (css, text) => Div({ as: 'section', css, children: text } as never).render() as Element],
  ['a children-first factory', (css, text) => Label(text, { css: css as never }).render() as Element],
  ['createNode(fn)', (css, text) => CardNode({ css: css as never, children: text }).render() as Element],
  ['Node(fn)', (css, text) => Node(Card, { css, children: text } as never).render() as Element],
]

describe.each(SHAPES)('%s in a server component, with no theme in scope', (_, render) => {
  it.each(KEYS)('hands a token in %s key to ThemedRule and writes none', (__, key) => {
    const root = render({ color: 'rgb(1, 2, 3)', [key]: { color: 'crimson' } }, 'x')
    const [themed] = themedRules(root)

    expect(serverRules(root).filter(text => text.includes('theme.'))).toEqual([])
    expect(themed.props.css).toEqual({ [key]: { color: 'crimson' } })
    expect(themed.props.className).toBe(classOf(root, 'x'))
  })

  it('hands a token in a nested at-rule inside a selector inside an at-rule to ThemedRule', () => {
    const nested = { '@media (min-width: 600px)': { '&:hover': { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } } } }
    const root = render({ color: 'rgb(1, 2, 3)', ...nested }, 'x')

    expect(serverRules(root).filter(text => text.includes('theme.'))).toEqual([])
    expect(themedRules(root)[0].props.css).toEqual(nested)
  })
})

describe('the split between the server rule and ThemedRule', () => {
  it('keeps a host tag the element itself, with its rule and ThemedRule after its children', () => {
    const root = Div({ css: { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } }, children: 'x' }).render() as Element
    const slot = (root.props.children as unknown[]).at(-1) as Element[]

    expect(root.type).toBe('div')
    expect(slot.map(e => e.type)).toEqual(['style', ThemedRule])
  })

  it('writes every declaration and the nested entries before the first themed one on the server', () => {
    const css = {
      color: 'rgb(1, 2, 3)',
      '&:focus': { outline: '1px solid' },
      '@media (width >= theme.breakpoint.wide)': { color: 'crimson' },
      '@media (min-width: 600px)': { color: 'blue' },
      padding: 4,
    }
    const root = Div({ css, children: 'x' }).render() as Element
    const [server] = serverRules(root)

    expect(server).toContain('color:rgb(1, 2, 3)')
    expect(server).toContain('padding:4px')
    expect(server).toContain(':focus{outline:1px solid;}')
    expect(server).not.toContain('color:blue')
    // The nested entry after the first themed one goes with it, so the two rules
    // cascade in the order Emotion writes one.
    expect(themedRules(root)[0].props.css).toEqual({
      '@media (width >= theme.breakpoint.wide)': { color: 'crimson' },
      '@media (min-width: 600px)': { color: 'blue' },
    })
  })

  it('names the class after the whole css, so css differing only in themed keys never shares one', () => {
    const a = Div({ css: { color: 'red', '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } }, children: 'a' }).render() as Element
    const b = Div({ css: { color: 'red', '@media (width >= theme.breakpoint.compact)': { color: 'crimson' } }, children: 'b' }).render() as Element

    expect(classOf(a, 'a')).not.toBe(classOf(b, 'b'))
  })
})

describe('a theme token in a key with a theme in scope', () => {
  it('resolves on the server to the theme’s value, with no ThemedRule', () => {
    const theme = { mode: 'light', system: { breakpoint: { wide: '1000px' } } }
    const root = Div({ theme, css: { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } }, children: 'x' } as never).render() as Element

    expect(serverRules(root).join('')).toContain('@media (width >= 1000px)')
    expect(themedRules(root)).toEqual([])
  })
})

describe('a theme token only in values', () => {
  it('stays wholly on the server, with no ThemedRule', () => {
    const root = Div({ css: { color: 'theme.primary', '@media (min-width: 600px)': { padding: 'theme.spacing.md' } }, children: 'x' }).render() as Element

    expect(root.type).toBe('div')
    expect(root.props.className).toMatch(/^meonode-css-/)
    expect(themedRules(root)).toEqual([])
  })
})

describe('a class with a themed key, handed into a styled element', () => {
  const handed = { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } }

  /** Styles its own element and passes on the class it is handed. */
  function Panel({ className, children }: { className?: string; children?: string }) {
    return Div({ className, css: { color: 'rgb(0, 128, 128)' }, children }).render() as Element
  }
  const PanelNode = createNode(Panel)

  /** The props `PanelNode(props)` hands `Panel`, compiled in the current request. */
  const panelProps = () => {
    const root = PanelNode({ css: handed, children: 'panel' } as never).render() as Element
    return inTree(root).find(e => e.type === Panel)!.props as { className?: string; children?: string }
  }

  it('is composed whole by ThemedRule, the element’s own css first and the handed class after', () => {
    const props = panelProps()
    const root = Panel(props)
    const [rule] = themedRules(root)

    expect(serverRules(root)).toEqual([])
    expect(rule.props.className).toBe(root.props.className)
    expect(rule.props.css).toEqual([expect.objectContaining({ color: 'rgb(0, 128, 128)' }), expect.objectContaining(handed)])
  })

  it('is composed the same way across a use-cache boundary', () => {
    const props = panelProps()
    request.values = new Map()
    const root = Panel(props)

    expect(themedRules(root)[0].props.css).toEqual([expect.objectContaining({ color: 'rgb(0, 128, 128)' }), expect.objectContaining(handed)])
  })
})
