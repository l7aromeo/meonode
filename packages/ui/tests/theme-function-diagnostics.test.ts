import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Div, type Theme } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { __resetThemeDiagnostics } from '@src/util/theme-diagnostics.util.js'

/**
 * A theme function with no ThemeProvider above it is dropped, which leaves the
 * author a missing style and nothing to search for. These pin the development
 * warning that names it, and that production stays silent and byte-identical.
 */

const captured: string[] = []
let originalWarn: typeof console.warn

beforeEach(() => {
  __resetThemeDiagnostics()
  captured.length = 0
  originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    captured.push(String(args[0]))
  }
})

afterEach(() => {
  console.warn = originalWarn
  vi.unstubAllEnvs()
  __resetThemeDiagnostics()
})

const themed = { margin: 4, color: (t: Theme) => t.system.colors.primary }
const render = () => renderToStaticMarkup(Div({ children: 'x', css: themed }).render())

describe('dropped theme functions', () => {
  it('warns once in development, naming the property', () => {
    render()
    render()
    const warnings = captured.filter(x => x.includes('no ThemeProvider'))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('`color`')
  })

  it('is silent in production, and emits byte-identical output either way', () => {
    const developmentHtml = render()
    captured.length = 0
    vi.stubEnv('NODE_ENV', 'production')
    __resetThemeDiagnostics()
    const productionHtml = render()
    expect(captured).toEqual([])
    expect(productionHtml).toBe(developmentHtml)
  })

  it('returns a style with no functions as the same reference when there is no theme', () => {
    const style = { margin: 4, '&:hover': { color: 'red' }, fontFamily: ['a', 'b'] }
    expect(ThemeUtil.resolveObjWithTheme(style, undefined, { processFunctions: true })).toBe(style)
  })

  it('copies only what holds a function, and leaves the input untouched', () => {
    const hover = { color: 'red' }
    const style = { margin: 4, '&:hover': hover, '&:focus': { color: themed.color } }
    const result = ThemeUtil.resolveObjWithTheme(style, undefined, { processFunctions: true })
    expect(result).toEqual({ margin: 4, '&:hover': { color: 'red' }, '&:focus': {} })
    expect(result['&:hover']).toBe(hover)
    expect(style['&:focus'].color).toBe(themed.color)
  })
})
