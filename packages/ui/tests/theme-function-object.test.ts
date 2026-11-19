// @vitest-environment jsdom
//
// A theme function in `css` may return a whole style: an object or an array under a
// selector or at-rule key, as the `css` type allows. What it returns is resolved
// like the rest of the style, so its theme tokens become variables, or they reach
// the stylesheet as `theme.…` text the browser drops.
import { Div, ThemeProvider, type Theme } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { cleanup, render } from '@testing-library/react'
import { asThemeProps } from './_theme-props.js'

afterEach(cleanup)

const theme: Theme = { mode: 'light', system: { spacing: { md: 16 }, primary: '#ff0000', breakpoints: { md: '768px' } } }

const len = 'var(--meonode-theme-spacing-md--len, var(--meonode-theme-spacing-md))'
const plain = 'var(--meonode-theme-primary)'

const resolve = (css: object) => ThemeUtil.resolveObjWithTheme(css as never, theme, { processFunctions: true, themeStringsMode: 'vars' })

describe('a theme function under a key returning a style', () => {
  // [label, css, its resolution]
  const cases: [string, object, object][] = [
    [
      'an object under a selector key',
      { '&:hover': () => ({ padding: 'theme.spacing.md', color: 'theme.primary' }) },
      { '&:hover': { padding: len, color: plain } },
    ],
    ['an object under an at-rule key', { '@media (min-width: 1px)': () => ({ padding: 'theme.spacing.md' }) }, { '@media (min-width: 1px)': { padding: len } }],
    [
      'an object under an at-rule key holding a token',
      { '@media (min-width: theme.breakpoints.md)': () => ({ padding: 'theme.spacing.md' }) },
      { '@media (min-width: 768px)': { padding: len } },
    ],
    [
      'a function in what a function returns',
      { '&:hover': () => ({ '&:focus': () => ({ padding: 'theme.spacing.md' }) }) },
      { '&:hover': { '&:focus': { padding: len } } },
    ],
    [
      'an array under a selector key',
      { '&:hover': () => [{ padding: 'theme.spacing.md' }, 'color: theme.primary;'] },
      { '&:hover': [{ padding: len }, `color: ${plain};`] },
    ],
  ]

  it.each(cases)('%s', (_, css, resolved) => {
    expect(resolve(css)).toEqual(resolved)
  })

  it('leaves a function that returns no style as it returns', () => {
    expect(resolve({ '&:hover': () => undefined, '&:focus': () => false })).toEqual({ '&:hover': undefined, '&:focus': false })
  })
})

describe('a theme function returning a style, rendered under a ThemeProvider', () => {
  it('writes the variables into the rule', () => {
    render(
      ThemeProvider({
        ...asThemeProps(theme),
        children: Div({ css: { '&:hover': () => ({ padding: 'theme.spacing.md' }) }, children: 'x' }),
      }).render(),
    )
    const text = [...document.head.querySelectorAll('style')].map(s => s.textContent).join('')
    expect(text).toMatch(/:hover\{[^}]*padding:var\(--meonode-theme-spacing-md--len, var\(--meonode-theme-spacing-md\)\);/)
    expect(text).not.toContain('theme.spacing.md')
  })
})
