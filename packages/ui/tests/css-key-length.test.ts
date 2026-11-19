// @vitest-environment jsdom
//
// A `css` object key may name its property in kebab case (`'padding-top'`), with
// a vendor prefix (`'-webkit-margin-start'`), or in camel case. Emotion writes
// each as the same property, so a numeric theme token under any of them takes
// the `--len` variant when that property takes a length, or it arrives as a bare
// number the browser drops.
//
// The server converts with `replaceThemeTokensWithCssVars`, the client with
// `ThemeUtil.resolveObjWithTheme`. Every case is checked on both, and they must
// agree, or the two sides compile different classes. `@meonode/compiler` makes
// the same choice at build time; its own suite checks it against this one.
import { Div, ThemeProvider, type Theme } from '@src/main.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { cleanup, render } from '@testing-library/react'
import { asThemeProps } from './_theme-props.js'

afterEach(cleanup)

const theme: Theme = { mode: 'light', system: { spacing: { md: 16 } } }

const len = 'var(--meonode-theme-spacing-md--len, var(--meonode-theme-spacing-md))'
const plain = 'var(--meonode-theme-spacing-md)'

const onServer = <T>(css: T) => replaceThemeTokensWithCssVars(css)
const onClient = <T>(css: T) => ThemeUtil.resolveObjWithTheme(css as never, theme, { themeStringsMode: 'vars' }) as T

describe('a theme token under a css key', () => {
  // [key, what the token becomes]
  const cases: [string, string][] = [
    ['paddingTop', len],
    ['padding-top', len],
    ['border-top-width', len],
    ['WebkitMarginStart', len],
    ['-webkit-margin-start', len],
    ['-moz-column-width', len],
    ['msWrapMargin', len],
    ['MsWrapMargin', len],
    ['-ms-wrap-margin', len],
    ['line-height', plain],
    ['z-index', plain],
    ['--padding-top', plain],
    ['Padding-Top', plain],
  ]

  it.each(cases)('%s', (key, converted) => {
    for (const css of [{ [key]: 'theme.spacing.md' }, { '&:hover': { [key]: 'theme.spacing.md' } }]) {
      const expected = JSON.parse(JSON.stringify(css).replace('theme.spacing.md', converted.replaceAll('"', '\\"')))
      expect(onServer(css)).toEqual(expected)
      expect(onClient(css)).toEqual(expected)
    }
  })

  it('in a fallback array', () => {
    const css = { 'padding-top': ['1px', 'theme.spacing.md'] }
    expect(onServer(css)).toEqual({ 'padding-top': ['1px', len] })
    expect(onClient(css)).toEqual({ 'padding-top': ['1px', len] })
  })
})

describe('a kebab-case css key rendered under a ThemeProvider', () => {
  it('writes the length variant into the rule', () => {
    const { container } = render(
      ThemeProvider({ ...asThemeProps(theme), children: Div({ css: { 'padding-top': 'theme.spacing.md' }, children: 'x' }) }).render(),
    )
    const div = [...container.querySelectorAll('div')].find(d => d.textContent === 'x' && d.children.length === 0)!
    const className = [...div.classList].find(c => c.startsWith('css-'))!
    const text = [...document.head.querySelectorAll('style')].map(s => s.textContent).join('')
    expect(text).toContain(`.${className}{`)
    expect(text.slice(text.indexOf(`.${className}{`)).split('}')[0]).toContain(`padding-top:${len};`)
  })
})
