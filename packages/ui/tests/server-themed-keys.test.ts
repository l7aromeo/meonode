// @vitest-environment node
//
// A theme token in a `css` key — an at-rule condition or a selector — needs the
// theme's concrete value: `var()` is invalid there. A server component cannot read
// the ThemeProvider above it, so in the React Server Components layer such a key
// has nothing to resolve against. No rule may ever carry the token itself, since
// the browser drops a rule whose condition or selector is invalid.
//
// `react` is replaced with the client build minus `useState`, the shape of the
// `react-server` build, with a `cache` that memoizes for one test at a time.
import { createElement, Fragment, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const { createNode, Div } = await import('@src/main.js')
const { default: StyledRenderer } = await import('@src/components/styled-renderer.client.js')
const { __resetThemeDiagnostics } = await import('@src/util/theme-diagnostics.util.js')

const warnings: string[] = []
let originalWarn: typeof console.warn

beforeEach(() => {
  request.values = new Map()
  __resetThemeDiagnostics()
  warnings.length = 0
  originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(String(args[0]))
  }
})

afterEach(() => {
  console.warn = originalWarn
  vi.unstubAllEnvs()
  __resetThemeDiagnostics()
})

const unresolvedKeyWarnings = () => warnings.filter(text => text.includes('could not be resolved'))

type Element = ReactElement<{ children?: unknown; css?: unknown; className?: string }>

/** The text of every `<style>` element anywhere in a rendered tree. */
function ruleTexts(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) ruleTexts(child, found)
    return found
  }
  if (!node || typeof node !== 'object' || !('props' in node)) return found
  const element = node as Element
  if (element.type === 'style' && typeof element.props.children === 'string') found.push(element.props.children)
  ruleTexts(element.props.children, found)
  return found
}

const KEYS = [
  ['@media', '@media (width >= theme.breakpoint.wide)'],
  ['@container', '@container (min-width: theme.breakpoint.wide)'],
  ['@supports', '@supports (gap: theme.spacing.md)'],
  ['a selector', '&[data-size="theme.size.lg"]'],
] as const

/** A plain server function component, given `css` by its caller. */
function Card({ className, children }: { className?: string; children?: string }) {
  return createElement('div', { className }, children)
}
const CardNode = createNode(Card)

describe.each(KEYS)('a theme token in %s key, with no theme to resolve it', (_, key) => {
  const css = { color: 'rgb(1, 2, 3)', [key]: { color: 'crimson' } }

  it('never reaches a rule on a host tag, which the client resolves instead', () => {
    const root = Div({ css, children: 'host' }).render() as Element

    expect(ruleTexts(root).filter(text => text.includes('theme.'))).toEqual([])
    expect(root.type).toBe(StyledRenderer)
    expect(Object.keys(root.props.css as object)).toContain(key)
  })

  it('never reaches a rule on a function component', () => {
    const root = CardNode({ css, children: 'component' }).render() as Element
    const rules = ruleTexts(root.type === Fragment ? root : createElement(Fragment, null, root))

    expect(rules.filter(text => text.includes('theme.'))).toEqual([])
  })
})

describe('a theme token in a key nested under a selector', () => {
  const css = { '&:hover': { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } } }

  it('never reaches a rule on a host tag or a function component', () => {
    const host = Div({ css, children: 'host' }).render() as Element
    const component = CardNode({ css, children: 'component' }).render() as Element

    expect(host.type).toBe(StyledRenderer)
    expect(ruleTexts(createElement(Fragment, null, component)).filter(text => text.includes('theme.'))).toEqual([])
  })
})

describe('the warning for a key left out', () => {
  const css = { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } }

  it('names the key once in development', () => {
    CardNode({ css, children: 'a' }).render()
    CardNode({ css, children: 'b' }).render()

    expect(unresolvedKeyWarnings()).toHaveLength(1)
    expect(unresolvedKeyWarnings()[0]).toContain('@media (width >= theme.breakpoint.wide)')
  })

  it('stays silent in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    __resetThemeDiagnostics()
    CardNode({ css, children: 'a' }).render()

    expect(unresolvedKeyWarnings()).toEqual([])
  })

  it('stays silent for a host tag, whose key the client resolves', () => {
    Div({ css, children: 'host' }).render()

    expect(unresolvedKeyWarnings()).toEqual([])
  })
})

describe('a theme token in a key with a theme in scope', () => {
  it('resolves on the server-compiled path to the theme’s value', () => {
    const theme = { mode: 'light', system: { breakpoint: { wide: '1000px' } } }
    const root = Div({ theme, css: { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } }, children: 'x' } as never).render() as Element

    expect(root.type).toBe('div')
    expect(ruleTexts(root).join('')).toContain('@media (width >= 1000px)')
  })
})

describe('a theme token only in values', () => {
  it('stays on the server-compiled path', () => {
    const root = Div({ css: { color: 'theme.primary', '@media (min-width: 600px)': { padding: 'theme.spacing.md' } }, children: 'x' }).render() as Element

    expect(root.type).toBe('div')
    expect(root.props.className).toMatch(/^meonode-css-/)
  })
})
