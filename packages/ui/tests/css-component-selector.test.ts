// @vitest-environment jsdom
//
// An Emotion styled component or component selector passed as `css`, through a
// cast or from plain JavaScript, is not a style. A styled component refers to
// itself, so the style walks recursed until the stack ran out, and a selector's
// `toString` was taken for a theme function; either crashed the render, on the
// server and in the browser. Development now throws an error that names the
// cause and where it sits. Production, which needs Emotion's production build,
// is covered in dev-mode-environments.test.ts.
import styled from '@emotion/styled'
import { createNode, Div, ThemeProvider, type Theme } from '@src/main.js'
import { isMergeableCss } from '@src/util/css.util.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { cleanup, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { asThemeProps } from './_theme-props.js'

afterEach(cleanup)

const theme: Theme = { mode: 'light', system: { spacing: { md: 16 } } }
const Box = styled.div({ color: 'red' })
const selector = { __emotion_styles: [], toString: () => '' }
// What a server component receives for a client module's export: a function
// React marks, which throws when the server calls it.
const clientReference = Object.assign(
  () => {
    throw new Error('a client reference was called')
  },
  { $$typeof: Symbol.for('react.client.reference') },
)

/** `css` on one element, under a provider or not. */
const tree = (css: unknown, withProvider: boolean) => {
  const element = Div({ css: css as never, children: 'x' })
  return (withProvider ? ThemeProvider({ ...asThemeProps(theme), children: element }) : element).render()
}

// [label, css, where it sits]
const shapes: [string, unknown, string][] = [
  ['a styled component as css', Box, 'css'],
  ['a component selector as css', selector, 'css'],
  ['a styled component in a css array', [{ color: 'blue' }, Box], 'css[1]'],
  ['a component selector in a css array', [selector], 'css[0]'],
  ['a styled component under a selector key', { color: 'blue', '&:hover': Box }, 'css["&:hover"]'],
  ['a component selector under a selector key', { '&:hover': selector }, 'css["&:hover"]'],
]

describe('in development', () => {
  describe.each(shapes)('%s', (_, css, path) => {
    const message = `\`${path}\` is an Emotion styled component or component selector`

    it.each([false, true])('throws, naming where, in the browser (provider: %s)', withProvider => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => render(tree(css, withProvider))).toThrow(message)
    })

    it.each([false, true])('throws, naming where, on the server (provider: %s)', withProvider => {
      expect(() => renderToString(tree(css, withProvider))).toThrow(message)
    })
  })

  describe('a client reference', () => {
    const message = 'is a client component or a client module export, which is not a style'

    it.each([
      ['as css', clientReference, 'css'],
      ['in a css array', [{ color: 'blue' }, clientReference], 'css[1]'],
      ['under a selector key', { color: 'blue', '&:hover': clientReference }, 'css["&:hover"]'],
    ])('throws %s, naming where', (_, css, path) => {
      expect(() => renderToString(tree(css, false))).toThrow(`\`${path}\` ${message}`)
    })
  })

  // A factory's css is walked once, the first time the factory is called.
  it('throws on every call of a factory whose own css holds one', () => {
    const Card = createNode('div', { css: { color: 'blue', '&:hover': selector } })
    for (const children of ['a', 'b']) expect(() => Card({ children })).toThrow('`css["&:hover"]` is an Emotion styled component')
  })

  it("throws for a call site's styled component beside a factory's css, naming the call site's", () => {
    const Card = createNode('div', { css: { color: 'blue' } })
    expect(() => renderToString(Card({ css: Box as never, children: 'x' }).render())).toThrow('`css` is an Emotion styled component')
  })
})

// What production relies on: the walks pass one through untouched, and Emotion
// writes nothing for it. In the browser a styled component is an object; on the
// server Emotion makes it a function, which must not be called as a theme function.
describe('the style walks', () => {
  const serverStyled = Object.assign(() => null, { __emotion_styles: [] })
  const resolve = (css: unknown) => ThemeUtil.resolveObjWithTheme(css as never, theme, { processFunctions: true, themeStringsMode: 'vars' }) as unknown

  it.each([
    ['a styled component', Box],
    ['a component selector', selector],
    ['a styled component as the server makes it', serverStyled],
    // A walk that entered this one would copy it to convert the token it holds.
    ['a styled component whose own styles hold a token', styled.div({ padding: 'theme.spacing.md' })],
  ])('pass %s through untouched, beside a value they convert', (_, value) => {
    const inArray = resolve([{ padding: 'theme.spacing.md' }, value]) as unknown[]
    expect(inArray[1]).toBe(value)
    expect(inArray[0]).not.toEqual({ padding: 'theme.spacing.md' })
    expect((resolve({ padding: 'theme.spacing.md', '&:hover': value }) as Record<string, unknown>)['&:hover']).toBe(value)
    expect(replaceThemeTokensWithCssVars({ padding: 'theme.spacing.md', '&:hover': value })['&:hover']).toBe(value)
  })

  // A server component with a node `theme` prop calls the theme functions in its
  // css, and a client reference is a function too.
  it('leave out a client reference rather than call it, beside a value they convert', () => {
    const inArray = resolve([{ padding: 'theme.spacing.md' }, clientReference]) as unknown[]
    expect(inArray[1]).toBeUndefined()
    expect(inArray[0]).not.toEqual({ padding: 'theme.spacing.md' })
    const inObject = resolve({ padding: 'theme.spacing.md', '&:hover': clientReference }) as Record<string, unknown>
    expect(inObject['&:hover']).toBeUndefined()
    expect(inObject.padding).not.toBe('theme.spacing.md')
  })

  it('take neither for a theme function nor a style map', () => {
    expect(ThemeUtil.hasThemeFunction([serverStyled])).toBe(false)
    expect(ThemeUtil.hasThemeFunction({ '&:hover': Box })).toBe(false)
    expect(isMergeableCss(Box)).toBe(false)
    expect(isMergeableCss(selector)).toBe(false)
  })
})
