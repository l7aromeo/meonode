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
const serverRules = (root: Element) =>
  inTree(root)
    .filter(e => e.type === 'style')
    .map(e => e.props.children as string)
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
    // Each resolver rule is written for its own element's class alone.
    expect(themedRules(a).map(rule => rule.props.className)).toEqual([classOf(a, 'a')])
    expect(themedRules(b).map(rule => rule.props.className)).toEqual([classOf(b, 'b')])
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

describe('a theme token in a key naming a value the theme in scope lacks', () => {
  it('is left out of the server rule, with no ThemedRule', () => {
    const theme = { mode: 'light', system: { breakpoint: { wide: '1000px' } } }
    const root = Div({
      theme,
      css: { color: 'red', '@media (width >= theme.breakpoint.huge)': { color: 'crimson' } },
      children: 'x',
    } as never).render() as Element

    expect(serverRules(root).join('')).toContain('color:red')
    expect(serverRules(root).filter(text => text.includes('theme.'))).toEqual([])
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

describe('what counts as a theme token in a key', () => {
  it('leaves a selector naming the class `.theme.accent` on the server, untouched', () => {
    const root = Div({ css: { '& .theme.accent': { color: 'crimson' } }, children: 'x' }).render() as Element

    expect(serverRules(root).join('')).toContain('.theme.accent{color:crimson;}')
    expect(themedRules(root)).toEqual([])
  })

  it('hands on a token in a selector that also names such a class', () => {
    const key = '& .theme.accent[data-size="theme.size.lg"]'
    const root = Div({ css: { [key]: { color: 'crimson' } }, children: 'x' }).render() as Element

    expect(themedRules(root)[0].props.css).toEqual({ [key]: { color: 'crimson' } })
  })
})

describe('css written as a string', () => {
  const text = 'color: theme.primary; @media (min-width: theme.breakpoint.wide) { color: crimson; }'

  it('goes whole to ThemedRule when a prelude holds a token, with declaration tokens as variables', () => {
    const root = Div({ css: text as never, children: 'x' }).render() as Element
    const [themed] = themedRules(root)

    expect(serverRules(root).filter(rule => rule.includes('theme.'))).toEqual([])
    expect(themed.props.css).toContain('color: var(--meonode-theme-primary); @media (min-width: theme.breakpoint.wide) { color: crimson; }')
    expect(themed.props.className).toBe(classOf(root, 'x'))
  })

  it('goes whole to ThemedRule from inside an array', () => {
    const root = Div({ css: [{ padding: 4 }, text] as never, children: 'x' }).render() as Element
    const [themed] = themedRules(root)

    expect(serverRules(root).filter(rule => rule.includes('theme.'))).toEqual([])
    expect(JSON.stringify(themed.props.css)).toContain('@media (min-width: theme.breakpoint.wide)')
  })

  it('stays on the server when its only tokens are in declarations or class names', () => {
    const root = Div({ css: 'color: theme.primary; & .theme.accent { color: crimson; }' as never, children: 'x' }).render() as Element

    expect(serverRules(root).join('')).toContain('.theme.accent{color:crimson;}')
    expect(serverRules(root).join('')).toContain('var(--meonode-theme-primary)')
    expect(themedRules(root)).toEqual([])
  })
})

describe('a theme function beside a themed key, with no theme in scope', () => {
  /** Whether a value holds a function anywhere. */
  const holdsFunction = (value: unknown): boolean =>
    typeof value === 'function' || (typeof value === 'object' && value !== null && Object.values(value).some(holdsFunction))
  const wide = '@media (width >= theme.breakpoint.wide)'

  it.each<[string, unknown, Record<string, unknown>?]>([
    ['a value in the themed part', { color: 'red', [wide]: { color: () => 'crimson', padding: 4 } }],
    ['a flat style prop', { [wide]: { color: 'crimson' } }, { color: () => 'crimson' }],
    ['an item of an array css', [{ [wide]: { color: 'crimson' } }, () => ({ color: 'red' })]],
  ])('sends ThemedRule none, for %s', (_, css, flat = {}) => {
    const root = Div({ ...flat, css: css as never, children: 'x' } as never).render() as Element
    const [themed] = themedRules(root)

    expect(JSON.stringify(themed.props.css)).toContain(wide)
    expect(holdsFunction(themed.props.css)).toBe(false)
  })
})

describe('a themed key on a node with async server children', () => {
  async function Late() {
    return createElement('span', null, 'late')
  }

  it('hands the key to ThemedRule and keeps the async child in place', () => {
    const root = Div({
      css: { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } },
      children: [createElement(Late, { key: 'late' })],
    }).render() as Element
    expect(inTree(root).some(e => e.type === Late)).toBe(true)
    expect(inTree(root).findIndex(e => e.type === Late)).toBeLessThan(inTree(root).findIndex(e => e.type === ThemedRule))
    expect(themedRules(root)[0].props.className).toBe(root.props.className)
  })

  it('hands the key to ThemedRule for an async function component', () => {
    const root = Node(async ({ className }: { className?: string }) => createElement('div', { className }, 'x'), {
      css: { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } },
    } as never).render() as Element

    expect(themedRules(root)).toHaveLength(1)
    expect(serverRules(root).filter(rule => rule.includes('theme.'))).toEqual([])
  })
})
