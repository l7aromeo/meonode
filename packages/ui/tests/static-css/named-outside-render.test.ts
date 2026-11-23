// @vitest-environment jsdom
//
// A node tree rendered with `.render()` outside any component's render, as at a
// root, walks with no Emotion cache to read: `use` cannot be called there, and a
// `CacheProvider` in the same element tree renders only after the walk. Neither
// the cache's key nor the classes it registered, which a `className` may hold, are
// known then, so a named node renders through `StyledRenderer`, handed its style,
// which composes its class where the element renders, under its cache. Each case
// must give the classes and rules its css gives on the runtime path.
import { CacheProvider, __unsafe_useEmotionCache as useEmotionCache } from '@emotion/react'
import createCache, { type EmotionCache } from '@emotion/cache'
import { serializeStyles } from '@emotion/serialize'
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Div, Span, type NodeInstance } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { shaped } from './_render-shapes.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Css = Record<string, unknown>
type Style = (css: Css) => Record<string, unknown>
const runtimeStyle: Style = css => ({ css })
const compiledStyle: Style = css => {
  const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const { name, styles } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  registerStaticCss(`m-${name}`, [[name, styles]])
  return { __meo$: 2, __meo$n: name }
}

/** A class a cache registered from another element's css. */
const REGISTERED = 'css-registered'
const REGISTERED_STYLES = 'margin:3px;'

let roots: Root[] = []
beforeEach(() => __resetStaticCss())
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  __resetStaticCss()
})

function mount(element: ReactElement) {
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  roots.push(root)
  act(() => root.render(element))
}

/** Emotion's default cache in the browser, which a page with no provider renders under. */
function defaultCache(): EmotionCache {
  let cache: EmotionCache | undefined
  mount(
    createElement(function Probe() {
      cache = useEmotionCache() as EmotionCache
      return null
    }),
  )
  return cache!
}

/** The rules of a cache's sheet, in order. */
const rulesOf = (cache: EmotionCache) => (cache.sheet.tags as HTMLStyleElement[]).flatMap(tag => [...(tag.sheet?.cssRules ?? [])].map(rule => rule.cssText))

const tree = (style: Style, className: string): NodeInstance =>
  Div({ 'data-n': 'p', className, ...style({ color: 'rgb(0, 0, 200)' }), children: Span('c', { 'data-n': 'c', ...style({ order: 2 }) }) })

const classes = () => [...document.body.querySelectorAll('[data-n]')].map(element => `${element.getAttribute('data-n')}: ${element.className}`)

describe.each([
  ['holding a class the cache registered', `given ${REGISTERED}`],
  ['holding only classes it did not', 'given other'],
])('a named node at the root of a render outside any component, its className %s', (_, className) => {
  it('under no provider, renders as its css would', () => {
    const cache = defaultCache()
    cache.registered[REGISTERED] = REGISTERED_STYLES
    const run = shaped((style: Style) => {
      document.body.innerHTML = ''
      mount(tree(style, className).render() as ReactElement)
      return classes()
    })
    const expected = run(runtimeStyle)
    expect(run(compiledStyle)).toEqual(expected)
    // The registered class's styles are in the element's own rule.
    if (className.includes(REGISTERED)) expect(rulesOf(cache).some(rule => rule.includes('margin: 3px'))).toBe(true)
  })

  it('under a provider in the same element tree, renders as its css would', () => {
    const run = shaped((style: Style) => {
      document.body.innerHTML = ''
      __resetStaticCss()
      const cache = createCache({ key: 'app', speedy: true })
      cache.registered[REGISTERED] = REGISTERED_STYLES
      mount(createElement(CacheProvider, { value: cache }, tree(style, className).render() as ReactElement))
      return { classes: classes(), rules: rulesOf(cache) }
    })
    const expected = run(runtimeStyle)
    expect(expected.rules.length).toBeGreaterThan(0)
    expect(expected.classes.join(' ')).toContain('app-')
    expect(run(compiledStyle)).toEqual(expected)
  })
})
