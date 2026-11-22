// @vitest-environment jsdom
//
// A server component hands a client reference's `StyledRenderer` a compiled
// node's style, `{ name, styles }`, in place of the css it was written from. Given
// either, it must give the element the same class and Emotion the same rules,
// in the browser and in a server render.
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { serializeStyles } from '@emotion/serialize'
import { act, createElement, type ReactElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { STATIC_STYLE_PROP } from '@src/constant/common.const.js'
import StyledRenderer from '@src/components/styled-renderer.client.js'
import { ThemeProvider } from '@src/main.js'
import { NodeUtil } from '@src/util/node.util.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'
import { __resetThemeDiagnostics } from '@src/util/theme-diagnostics.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CSS = { color: 'rgb(0, 0, 200)', '&:hover': { color: 'rgb(200, 0, 0)' } }

/** The name and text the runtime computes for `css`, which the compiler writes for it. */
function compile(css: Record<string, unknown>): { name: string; styles: string } {
  const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const { name, styles } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  return { name, styles }
}

/** Stands in for a client component such as a link: puts its class on an anchor. */
const Link = ({ className, children }: { className?: string; children?: ReactNode }) => createElement('a', { className, 'data-n': 'link' }, children)

const STYLES = {
  css: { css: CSS },
  'the compiled style': { [STATIC_STYLE_PROP]: compile(CSS) },
}

/** A class the cache registered from another element's css, which `StyledRenderer` folds into the element's own. */
const REGISTERED = 'css-registered'

/** A cache holding {@link REGISTERED}. */
function cacheWithRegistered(options: Parameters<typeof createCache>[0]) {
  const cache = createCache(options)
  cache.registered[REGISTERED] = 'margin:3px;'
  return cache
}

/** The element through `StyledRenderer`, handed a plain class and, with `fold`, a registered one. */
const page = (style: Record<string, unknown>, fold: boolean) =>
  createElement(
    StyledRenderer as never,
    { element: Link, className: fold ? `given ${REGISTERED}` : 'given', ...style, children: 'go' } as never,
  ) as ReactElement

describe('a client reference’s StyledRenderer given a compiled style', () => {
  it.each([
    ['alone', false],
    ['with a registered class folded in', true],
  ])('gives the element the class and the sheet the rules its css would, in the browser, %s', (_, fold) => {
    const run = (style: Record<string, unknown>) => {
      document.head.innerHTML = ''
      document.body.innerHTML = ''
      const cache = cacheWithRegistered({ key: 'css', speedy: true })
      const root = createRoot(document.body.appendChild(document.createElement('div')))
      act(() => root.render(createElement(CacheProvider, { value: cache }, page(style, fold))))
      const result = {
        className: document.querySelector('[data-n]')?.className,
        rules: [...document.head.querySelectorAll<HTMLStyleElement>('style[data-emotion]')].flatMap(element =>
          [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText),
        ),
      }
      act(() => root.unmount())
      return result
    }
    const expected = run(STYLES.css)
    expect(expected.rules.length).toBeGreaterThan(0)
    expect(expected.rules.some(rule => rule.includes('margin: 3px'))).toBe(fold)
    expect(run(STYLES['the compiled style'])).toEqual(expected)
  })

  it.each([
    ['with no cache provider', false, false],
    ['under a cache provider', true, false],
    ['under a cache provider, with a registered class folded in', true, true],
  ])('renders the same markup on the server %s', (_, provider, fold) => {
    const render = (style: Record<string, unknown>) => {
      NodeUtil.isServer = true
      try {
        const element = page(style, fold)
        return renderToString(provider ? createElement(CacheProvider, { value: cacheWithRegistered({ key: 'css' }) }, element) : element)
      } finally {
        NodeUtil.isServer = false
      }
    }
    const expected = render(STYLES.css)
    expect(expected).toContain('class="given css-')
    expect(render(STYLES['the compiled style'])).toEqual(expected)
  })

  it('warns for a theme token the theme in scope lacks, as its css does', () => {
    const css = replaceThemeTokensWithCssVars({ color: 'theme.primary.missing' })
    const warnings = (style: Record<string, unknown>) => {
      __resetThemeDiagnostics()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const root = createRoot(document.body.appendChild(document.createElement('div')))
      const theme = { tokens: { primary: { default: 'rgb(0, 0, 255)' } }, modes: ['light'], defaultMode: 'light' }
      act(() => root.render(ThemeProvider({ ...theme, children: page(style, false) } as never).render() as ReactElement))
      act(() => root.unmount())
      const found = warn.mock.calls.map(call => String(call[0])).filter(text => text.includes('--meonode-theme-'))
      warn.mockRestore()
      return found
    }
    const expected = warnings({ css })
    expect(expected.length).toBeGreaterThan(0)
    expect(warnings({ [STATIC_STYLE_PROP]: compile(css) })).toEqual(expected)
  })
})
