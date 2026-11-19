// @vitest-environment jsdom
//
// Emotion's `css()` and `keyframes()` return serialized styles: `styles` is CSS
// text, and the rest is Emotion's own record of it, such as the `name` it hashed,
// the keyframes marker and a `toString` method. The client calls theme functions
// it finds in a style, so a `toString` taken for one ran without its object and
// threw, and with no provider it was dropped and reported. The record is left as
// Emotion wrote it, on the server and in the browser alike.
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

const onServer = <T>(value: T) => replaceThemeTokensWithCssVars(value)
const onClient = <T>(value: T) => ThemeUtil.resolveObjWithTheme(value as never, theme, { processFunctions: true, themeStringsMode: 'vars' }) as T

describe('a keyframes() result as a value', () => {
  const fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

  /** The rules written for the one element rendered by `tree`. */
  const renderRules = (tree: { render(): Parameters<typeof render>[0] }) => {
    render(tree.render())
    return [...document.head.querySelectorAll('style')].map(s => s.textContent).join('')
  }

  it('renders under a ThemeProvider', () => {
    const text = renderRules(ThemeProvider({ ...asThemeProps(theme), children: Div({ css: { animationName: fade }, children: 'x' }) }))
    expect(text).toContain(`animation-name:${fade.name};`)
    expect(text).toContain(`@keyframes ${fade.name}{`)
  })

  it('renders with no provider, and reports no dropped theme function', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const text = renderRules(Div({ css: { animationName: fade }, children: 'x' }))
    expect(text).toContain(`animation-name:${fade.name};`)
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/function/i)
    warn.mockRestore()
  })

  it('reports only the theme function beside it with no provider', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const text = renderRules(Div({ css: { animationName: fade, borderColor: () => 'red' }, children: 'x' }))
    expect(text).toContain(`animation-name:${fade.name};`)
    const reports = warn.mock.calls.flat().join(' ')
    expect(reports).toContain('`borderColor`')
    expect(reports).not.toContain('toString')
    warn.mockRestore()
  })

  // An element whose css holds a theme function follows the theme's mode, and
  // re-renders when it changes.
  it('is no theme function, and neither is a css() result', () => {
    expect(ThemeUtil.hasThemeFunction({ animationName: fade })).toBe(false)
    expect(ThemeUtil.hasThemeFunction(css({ padding: 4 }))).toBe(false)
  })
})

describe("Emotion's record on serialized styles", () => {
  it('keeps the name, the keyframes marker and toString, and leaves the input as it was', () => {
    const fade = keyframes({ from: { marginLeft: 'theme.spacing.md' } })
    const before = Object.entries(fade)
    for (const converted of [onServer(fade), onClient(fade)]) {
      expect(converted.name).toBe(fade.name)
      expect(converted.anim).toBe(1)
      expect(typeof converted.toString).toBe('function')
      expect(String(converted)).toContain(fade.name)
    }
    expect(Object.entries(fade)).toEqual(before)
  })

  it('keeps a name holding a token as Emotion wrote it', () => {
    const labelled = css({ label: 'theme.card', padding: 'theme.spacing.md' })
    expect(labelled.name).toContain('theme.card')
    expect(onServer(labelled).name).toBe(labelled.name)
    expect(onClient(labelled).name).toBe(labelled.name)
  })
})
