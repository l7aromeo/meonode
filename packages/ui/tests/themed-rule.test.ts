// @vitest-environment node
//
// `ThemedRule` runs where the theme is — the server pass of the client tree, and
// the browser — and writes the rule a server component handed it for a css key
// holding a theme token. `StyledRenderer` resolves the same keys for a client
// component. Neither may ever hand a token to Emotion in a key.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Div, ThemeProvider } from '@src/main.js'
import { ThemedRule } from '@src/components/styled-renderer.client.js'
import { __resetThemeDiagnostics } from '@src/util/theme-diagnostics.util.js'

const warnings: string[] = []
let originalWarn: typeof console.warn

beforeEach(() => {
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

const unresolved = () => warnings.filter(text => text.includes('could not be resolved'))
const themed = (children: unknown) =>
  renderToString(ThemeProvider({ tokens: { breakpoint: { wide: '1000px' }, size: { lg: '12px' } }, modes: ['light'], defaultMode: 'light', children } as never).render() as never)
const styleText = (html: string) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('')

describe('ThemedRule under a ThemeProvider', () => {
  it.each([
    ['@media (width >= theme.breakpoint.wide)', '@media (width >= 1000px){.meonode-css-x{color:crimson;}}'],
    ['@container (min-width: theme.breakpoint.wide)', '@container (min-width: 1000px){.meonode-css-x{color:crimson;}}'],
    ['@supports (width: theme.breakpoint.wide)', '@supports (width: 1000px){.meonode-css-x{color:crimson;}}'],
    ['&[data-size="theme.size.lg"]', '.meonode-css-x[data-size="12px"]{color:crimson;}'],
  ])('writes %s with the theme’s value, for the class it was given', (key, rule) => {
    const html = themed(createElement(ThemedRule, { className: 'meonode-css-x', css: { [key]: { color: 'crimson' } } }))

    expect(styleText(html)).toContain(rule)
    expect(styleText(html)).not.toContain('theme.')
  })

  it('writes a nested at-rule inside a selector inside an at-rule', () => {
    const css = { '@media (min-width: 600px)': { '&:hover': { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } } } }
    const html = themed(createElement(ThemedRule, { className: 'meonode-css-x', css }))

    expect(styleText(html)).toContain('@media (min-width: 600px){@media (width >= 1000px){.meonode-css-x:hover{color:crimson;}}}')
  })

  it('leaves out a key naming a value the theme lacks, and reports it', () => {
    const html = themed(createElement(ThemedRule, { className: 'meonode-css-x', css: { '@media (width >= theme.breakpoint.huge)': { color: 'crimson' } } }))

    expect(styleText(html)).not.toContain('theme.')
    expect(unresolved()).toHaveLength(1)
  })
})

describe('ThemedRule given a composition', () => {
  it('writes the element’s own css and the handed class’s in order, as one class', () => {
    const css = [{ color: 'rgb(0, 128, 128)' }, { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } }]
    const text = styleText(themed(createElement(ThemedRule, { className: 'meonode-css-x', css })))

    expect(text).toContain('.meonode-css-x{color:rgb(0, 128, 128);}@media (width >= 1000px){.meonode-css-x{color:crimson;}}')
  })
})

describe('ThemedRule with no ThemeProvider', () => {
  const css = { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } }

  it('writes nothing, and names the key once in development', () => {
    expect(renderToString(createElement(ThemedRule, { className: 'meonode-css-x', css }))).toBe('')
    renderToString(createElement(ThemedRule, { className: 'meonode-css-y', css }))

    expect(unresolved()).toHaveLength(1)
    expect(unresolved()[0]).toContain('@media (width >= theme.breakpoint.wide)')
  })

  it('stays silent about it in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    __resetThemeDiagnostics()
    renderToString(createElement(ThemedRule, { className: 'meonode-css-x', css }))

    expect(unresolved()).toEqual([])
  })
})

describe('StyledRenderer with no ThemeProvider', () => {
  it('hands no token to Emotion in a key', () => {
    const html = renderToString(Div({ css: { color: 'red', '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } }, children: 'x' }).render() as never)

    expect(styleText(html)).toContain('color:red')
    expect(styleText(html)).not.toContain('theme.')
    expect(unresolved()).toHaveLength(1)
  })
})
