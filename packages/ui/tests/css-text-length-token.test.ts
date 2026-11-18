// @vitest-environment jsdom
//
// A theme token inside CSS text — a `css` string, or a string in a `css` array —
// has no object key to say which property it is written against. Each
// declaration names its own, and a length property must reference the token's
// `--len` variant, as it does in the object form, or a numeric token arrives as a
// bare number the browser rejects.
//
// The server converts CSS text with `replaceThemeTokensWithCssVars`, the client
// with `ThemeUtil.resolveObjWithTheme`. Every case is checked on both, and they
// must agree, or the two sides compile different classes.
import { Div, ThemeProvider, type Theme } from '@src/main.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { cleanup, render } from '@testing-library/react'
import { asThemeProps } from './_theme-props.js'

afterEach(cleanup)

const theme: Theme = {
  mode: 'light',
  system: { spacing: { sm: 4, md: 16 }, primary: '#ff0000', text: { tight: 1.25 }, layer: { modal: 40 }, fade: 0.5, breakpoints: { md: '768px' } },
}

const len = (path: string) => `var(--meonode-theme-${path}--len, var(--meonode-theme-${path}))`
const plain = (path: string) => `var(--meonode-theme-${path})`

/** CSS text as the server converts it. */
const onServer = (text: string) => replaceThemeTokensWithCssVars(text)

/** CSS text as the client converts it: a string in a `css` array, under a theme. */
const onClient = (text: string) => ThemeUtil.resolveObjWithTheme([text] as never, theme, { processFunctions: true, themeStringsMode: 'vars' })[0] as string

describe('theme tokens in CSS text', () => {
  // [label, CSS text, its conversion]
  const cases: [string, string, string][] = [
    ['a declaration list', 'padding: theme.spacing.md; color: theme.primary;', `padding: ${len('spacing-md')}; color: ${plain('primary')};`],
    ['a hyphenated property', 'padding-top: theme.spacing.md;', `padding-top: ${len('spacing-md')};`],
    ['a property written in capitals', 'PADDING: theme.spacing.md;', `PADDING: ${len('spacing-md')};`],
    ['a -webkit- property', '-webkit-margin-start: theme.spacing.md;', `-webkit-margin-start: ${len('spacing-md')};`],
    ['a -ms- property', '-ms-wrap-margin: theme.spacing.md;', `-ms-wrap-margin: ${len('spacing-md')};`],
    ['a shorthand of several tokens', 'margin: theme.spacing.sm theme.spacing.md;', `margin: ${len('spacing-sm')} ${len('spacing-md')};`],
    ['!important', 'padding: theme.spacing.md !important;', `padding: ${len('spacing-md')} !important;`],
    ['calc()', 'color: red; width: calc(theme.spacing.md * 2);', `color: red; width: calc(${len('spacing-md')} * 2);`],
    ['a declaration after a nested block', '&:hover { color: red; } padding: theme.spacing.md;', `&:hover { color: red; } padding: ${len('spacing-md')};`],
    ['a declaration inside a nested block', '&:hover { padding: theme.spacing.md; }', `&:hover { padding: ${len('spacing-md')}; }`],
    ['a declaration with no trailing semicolon', 'color: red; padding: theme.spacing.md', `color: red; padding: ${len('spacing-md')}`],
    [
      'a semicolon inside url()',
      'background: url(data:image/png;base64,AAAA) theme.spacing.md theme.spacing.md no-repeat;',
      `background: url(data:image/png;base64,AAAA) ${len('spacing-md')} ${len('spacing-md')} no-repeat;`,
    ],
    [
      'numbers that stay unitless',
      'line-height: theme.text.tight; z-index: theme.layer.modal; opacity: theme.fade;',
      `line-height: ${plain('text-tight')}; z-index: ${plain('layer-modal')}; opacity: ${plain('fade')};`,
    ],
    ['a custom property', '--gap: theme.spacing.md;', `--gap: ${plain('spacing-md')};`],
    ['a comment before the property', 'color: red; /* gutter */ padding: theme.spacing.md;', `color: red; /* gutter */ padding: ${len('spacing-md')};`],
    ['a bare value, with no declaration', 'theme.spacing.md', plain('spacing-md')],
  ]

  it.each(cases)('%s', (_, text, converted) => {
    expect(onServer(text)).toBe(converted)
    expect(onClient(text)).toBe(converted)
  })

  it('leaves a token in a prelude to the resolver that has the theme, and converts the block', () => {
    const text = '@media (min-width: theme.breakpoints.md) { margin: theme.spacing.md; }'
    expect(onServer(text)).toBe(`@media (min-width: theme.breakpoints.md) { margin: ${len('spacing-md')}; }`)
    expect(onClient(text)).toBe(`@media (min-width: 768px) { margin: ${len('spacing-md')}; }`)
  })
})

describe('a function in a css array returning CSS text', () => {
  it('converts what it returns as CSS text', () => {
    const [converted] = ThemeUtil.resolveObjWithTheme([() => 'padding: theme.spacing.md;'] as never, theme, {
      processFunctions: true,
      themeStringsMode: 'vars',
    }) as unknown as string[]
    expect(converted).toBe(`padding: ${len('spacing-md')};`)
  })
})

describe('a token in a string under an object key', () => {
  // The key decides, as before: under a selector key a string is not CSS text
  // Emotion reads, and `@meonode/compiler` writes the plain variable there.
  it.each<[string, Record<string, string>, Record<string, string>]>([
    ['a property key', { padding: 'theme.spacing.md' }, { padding: len('spacing-md') }],
    ['a selector key', { '&:hover': 'padding: theme.spacing.md' }, { '&:hover': `padding: ${plain('spacing-md')}` }],
  ])('%s', (_, css, converted) => {
    expect(replaceThemeTokensWithCssVars(css)).toEqual(converted)
    expect(ThemeUtil.resolveObjWithTheme(css, theme, { themeStringsMode: 'vars' })).toEqual(converted)
  })
})

describe('a css string rendered under a ThemeProvider', () => {
  it('writes the length variant into the rule', () => {
    const { container } = render(ThemeProvider({ ...asThemeProps(theme), children: Div({ css: 'padding: theme.spacing.md;', children: 'x' }) }).render())
    const div = [...container.querySelectorAll('div')].find(d => d.textContent === 'x' && d.children.length === 0)!
    const className = [...div.classList].find(c => c.startsWith('css-'))!
    const text = [...document.head.querySelectorAll('style')].map(s => s.textContent).join('')
    expect(text).toContain(`.${className}{`)
    expect(text.slice(text.indexOf(`.${className}{`)).split('}')[0]).toContain(`padding:${len('spacing-md')};`)
  })
})
