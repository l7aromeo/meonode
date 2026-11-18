// @vitest-environment jsdom
//
// An array under a property key is a fallback list: Emotion writes one
// declaration of that property per item. Each item is a value of the property,
// so a theme token in it takes the `--len` variant exactly as the property's
// single value does, or a numeric token arrives as a bare number the browser
// drops.
//
// The server converts with `replaceThemeTokensWithCssVars`, the client with
// `ThemeUtil.resolveObjWithTheme`. Every case is checked on both, and they must
// agree, or the two sides compile different classes.
import { Div, ThemeProvider, type Theme } from '@src/main.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { cleanup, render } from '@testing-library/react'
import { asThemeProps } from './_theme-props.js'

afterEach(cleanup)

const theme: Theme = {
  mode: 'light',
  system: { spacing: { sm: 4, md: 16 }, primary: '#ff0000', text: { tight: 1.25 } },
}

const len = (path: string) => `var(--meonode-theme-${path}--len, var(--meonode-theme-${path}))`
const plain = (path: string) => `var(--meonode-theme-${path})`

const onServer = <T>(css: T) => replaceThemeTokensWithCssVars(css)
const onClient = <T>(css: T) => ThemeUtil.resolveObjWithTheme(css as never, theme, { processFunctions: true, themeStringsMode: 'vars' }) as T

describe('theme tokens in a fallback array', () => {
  const shared = ['theme.spacing.md']

  // [label, css, its conversion]
  const cases: [string, unknown, unknown][] = [
    ['one item', { padding: ['theme.spacing.md'] }, { padding: [len('spacing-md')] }],
    [
      'several items, one a shorthand',
      { margin: ['theme.spacing.sm', 'theme.spacing.sm theme.spacing.md'] },
      { margin: [len('spacing-sm'), `${len('spacing-sm')} ${len('spacing-md')}`] },
    ],
    ['a property that stays unitless', { lineHeight: ['theme.text.tight'] }, { lineHeight: [plain('text-tight')] }],
    ['a property inside a nested block', { '&:hover': { padding: ['theme.spacing.md'] } }, { '&:hover': { padding: [len('spacing-md')] } }],
    [
      'one array under a length and a unitless property',
      { padding: shared, lineHeight: shared },
      { padding: [len('spacing-md')], lineHeight: [plain('spacing-md')] },
    ],
    ['one array under a property and in a css array', [{ padding: shared }, shared], [{ padding: [len('spacing-md')] }, [plain('spacing-md')]]],
    [
      'a container inside a fallback array',
      { padding: ['theme.spacing.md', { color: 'theme.primary' }] },
      { padding: [len('spacing-md'), { color: plain('primary') }] },
    ],
    // A key that names no length property holds CSS text, as a css array does.
    ['an array under the css prop', { css: ['padding: theme.spacing.md;'] }, { css: [`padding: ${len('spacing-md')};`] }],
    ['an array under a selector key', { '&:hover': ['padding: theme.spacing.md;'] }, { '&:hover': [`padding: ${len('spacing-md')};`] }],
  ]

  it.each(cases)('%s', (_, css, converted) => {
    expect(onServer(css)).toEqual(converted)
    expect(onClient(css)).toEqual(converted)
  })

  it('calls a theme function in a fallback array once, and converts what it returns', () => {
    let calls = 0
    const css = {
      padding: [
        () => {
          calls++
          return 'theme.spacing.md'
        },
      ],
    }
    expect(onClient(css)).toEqual({ padding: [len('spacing-md')] })
    expect(calls).toBe(1)
  })
})

describe('a fallback array rendered under a ThemeProvider', () => {
  it('writes the length variant into each declaration', () => {
    const { container } = render(
      ThemeProvider({ ...asThemeProps(theme), children: Div({ css: { padding: ['1px', 'theme.spacing.md'] }, children: 'x' }) }).render(),
    )
    const div = [...container.querySelectorAll('div')].find(d => d.textContent === 'x' && d.children.length === 0)!
    const className = [...div.classList].find(c => c.startsWith('css-'))!
    const text = [...document.head.querySelectorAll('style')].map(s => s.textContent).join('')
    expect(text).toContain(`.${className}{`)
    expect(text.slice(text.indexOf(`.${className}{`)).split('}')[0]).toContain(`padding:1px;padding:${len('spacing-md')};`)
  })
})
