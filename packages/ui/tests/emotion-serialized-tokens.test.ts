// @vitest-environment jsdom
//
// Emotion's `css()` and `keyframes()` return their styles already serialized:
// `styles` is CSS text and `name` is the hash Emotion derived from it. A theme
// token in that text is written against the declaration it sits in, as in any
// CSS text, so a token under a length property takes the `--len` variant, or a
// numeric token arrives as a bare number the browser drops.
//
// The server converts with `replaceThemeTokensWithCssVars`, the client with
// `ThemeUtil.resolveObjWithTheme`. Every case is checked on both, and they must
// agree, or the two sides compile different classes.
import { css, keyframes } from '@emotion/react'
import { Div, ThemeProvider, type Theme } from '@src/main.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { cleanup, render } from '@testing-library/react'
import { asThemeProps } from './_theme-props.js'

afterEach(cleanup)

const theme: Theme = {
  mode: 'light',
  system: { spacing: { sm: 4, md: 16 }, primary: '#ff0000' },
}

const len = (path: string) => `var(--meonode-theme-${path}--len, var(--meonode-theme-${path}))`
const plain = (path: string) => `var(--meonode-theme-${path})`

const onServer = <T>(value: T) => replaceThemeTokensWithCssVars(value)
const onClient = <T>(value: T) => ThemeUtil.resolveObjWithTheme(value as never, theme, { processFunctions: true, themeStringsMode: 'vars' }) as T

/** The `styles` text a value converts to, on the server and on the client, which must agree. */
const convertedStyles = (value: { styles: string }) => {
  const server = onServer(value)
  const client = onClient(value)
  expect(client.styles).toBe(server.styles)
  return server.styles
}

describe("theme tokens in Emotion's serialized styles", () => {
  it('takes the length variant under a length property in a css() result', () => {
    const styles = convertedStyles(css({ padding: 'theme.spacing.md', color: 'theme.primary' }))
    expect(styles).toBe(`padding:${len('spacing-md')};color:${plain('primary')};`)
  })

  it('takes the length variant in a keyframes() result, which its toString writes', () => {
    const fade = keyframes({ from: { marginLeft: 'theme.spacing.md' } })
    expect(convertedStyles(fade)).toContain(`margin-left:${len('spacing-md')};`)
    expect(String(onServer(fade))).toContain(len('spacing-md'))
    expect(String(onClient(fade))).toContain(len('spacing-md'))
  })

  it('converts a keyframes() result carried in the next chain of a css() result', () => {
    const fade = keyframes({ from: { marginLeft: 'theme.spacing.md' } })
    const styled = css({ animationName: fade, padding: 'theme.spacing.sm' })
    for (const converted of [onServer(styled), onClient(styled)]) {
      expect(converted.styles).toContain(`padding:${len('spacing-sm')};`)
      expect(converted.next?.name).toBe(fade.name)
      expect(converted.next?.styles).toContain(`margin-left:${len('spacing-md')};`)
    }
  })

  it('converts a css() result nested under a selector and inside a css array', () => {
    const styled = css({ padding: 'theme.spacing.md' })
    expect(onServer({ '&:hover': styled })).toEqual(onClient({ '&:hover': styled }))
    expect(onServer({ '&:hover': styled })['&:hover'].styles).toBe(`padding:${len('spacing-md')};`)
    expect(onServer([styled])[0].styles).toBe(`padding:${len('spacing-md')};`)
    expect(onClient([styled])[0].styles).toBe(`padding:${len('spacing-md')};`)
  })

  // Emotion writes any object with a string `styles` from that string alone, so
  // it is CSS text whoever made it. A `styles` key holding anything else is
  // covered in css-reserved-styles-key.test.ts.
  it.each([['a string styles is CSS text', { styles: 'padding: theme.spacing.md' }, { styles: `padding: ${len('spacing-md')}` }]])(
    '%s',
    (_, value, converted) => {
      expect(onServer(value)).toEqual(converted)
      expect(onClient(value)).toEqual(converted)
    },
  )
})

describe('a css() result rendered under a ThemeProvider', () => {
  it('writes the length variant into its declaration', () => {
    const { container } = render(
      ThemeProvider({ ...asThemeProps(theme), children: Div({ css: css({ padding: 'theme.spacing.md' }), children: 'x' }) }).render(),
    )
    const div = [...container.querySelectorAll('div')].find(d => d.textContent === 'x' && d.children.length === 0)!
    const className = [...div.classList].find(c => c.startsWith('css-'))!
    const text = [...document.head.querySelectorAll('style')].map(s => s.textContent).join('')
    expect(text.slice(text.indexOf(`.${className}{`)).split('}')[0]).toContain(`padding:${len('spacing-md')};`)
  })
})
