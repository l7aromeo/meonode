// @vitest-environment jsdom
//
// Both theme token rewriters keep the strings they rewrite: the server's
// `replaceThemeTokensWithCssVars`, and the client's `ThemeUtil.resolveObjWithTheme`
// in `vars` mode. An inline call site passes new objects on every render but the
// same string literals, so a token is rewritten on its first two renders instead
// of on every render. A string is kept on its second sighting, so strings that are
// new on every render never push out the ones a page writes each time.
//
// A string's rewrite depends on its context as well as its text: the same token
// takes the `--len` variant under a length property and the plain variable
// elsewhere. A cache keyed on the text alone would hand one context the other's
// answer, so every case below reads one string in several contexts, in both
// orders, through both rewriters. The rewrite never reads the theme, so a theme
// change cannot make a kept string stale; the render cases change it between
// renders and compare against the cache turned off.
//
// The caches are module state that outlives every render, so they are also
// checked against growth: a flood of distinct strings, repeated full re-mounts,
// and route changes. The server's requests are in the `.ssr` file beside this one.
// Compiled, the render cases' call sites arrive with their tokens rewritten, so
// they keep nothing; those cases check that instead.
import { Div, Node, ThemeProvider, type Theme } from '@src/main.js'
import { cachedThemeRewrites, replaceThemeTokensWithCssVars, setThemeRewriteCacheCap } from '@src/util/server-theme.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { __resetThemeDiagnostics } from '@src/util/theme-diagnostics.util.js'
import { cleanup, render } from '@testing-library/react'
import { createElement, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

/** The cap the module ships with, per kind of context. */
const SHIPPED_CAP = 512
/** Kinds of context, each with a cache of its own: CSS text, a length property, any other value. */
const CACHES = 3
/** Whether call sites reach the runtime rewrite, which a compiled build does not. */
const RUNTIME = process.env.MEONODE_COMPILED !== '1'
const kept = () => cachedThemeRewrites().kept
const seen = () => cachedThemeRewrites().seen

afterEach(() => {
  cleanup()
  setThemeRewriteCacheCap(SHIPPED_CAP)
})

const len = (path: string) => `var(--meonode-theme-${path}--len, var(--meonode-theme-${path}))`
const plain = (path: string) => `var(--meonode-theme-${path})`

const theme: Theme = { mode: 'light', system: { spacing: { md: 16 } } }

const resolve = (css: unknown) => ThemeUtil.resolveObjWithTheme({ css }, theme, { processFunctions: true, themeStringsMode: 'vars' }).css

/**
 * The two rewriters, each as a function of a style. The client reads CSS text as
 * an item of a `css` array, where it meets it; a string held directly under the
 * `css` key would be read as a value of a property of that name.
 */
const rewriters: [string, (css: unknown) => unknown][] = [
  ['the server walk', css => replaceThemeTokensWithCssVars(css)],
  ['the client resolver', css => (typeof css === 'string' ? (resolve([css]) as string[])[0] : resolve(css))],
]

/** Every context a string can be rewritten in, and what `theme.<path>` becomes in each. */
const contexts: [string, (token: string) => unknown, (out: unknown) => unknown, (path: string) => string][] = [
  ['a length property', t => ({ padding: t }), o => (o as { padding: string }).padding, len],
  ['another property', t => ({ zIndex: t }), o => (o as { zIndex: string }).zIndex, plain],
  ['a selector key', t => ({ '&:hover': t }), o => (o as Record<string, string>)['&:hover'], plain],
  ['a length fallback list', t => ({ margin: [t] }), o => (o as { margin: string[] }).margin[0], len],
  ['CSS text, as a length declaration', t => `padding: ${t}`, o => (o as string).slice('padding: '.length), len],
  ['CSS text, as another declaration', t => `z-index: ${t}`, o => (o as string).slice('z-index: '.length), plain],
]

/** The text of every rule Emotion wrote for the leaf `div` reading `text`, and the page around it. */
const snapshot = (container: HTMLElement, text: string): string[] => {
  const div = [...container.querySelectorAll('div')].find(d => d.textContent === text && d.children.length === 0)!
  const className = [...div.classList].find(c => c.startsWith('css-'))!
  const sheet = [...document.head.querySelectorAll('style')].map(s => s.textContent).join('')
  return [container.innerHTML, ...sheet.split('}').filter(rule => rule.includes(`.${className}`))]
}

/**
 * Renders what `make` builds inside a component below the provider, as an app does.
 * A node that is the provider's own child is converted with the provider's props
 * instead, so a test rendering one there would not reach the client resolver.
 */
const Content = ({ make }: { make: () => { render: () => ReactNode } }) => make().render()
const page = (tokens: Record<string, unknown>, mode: string, make: () => { render: () => ReactNode }) =>
  ThemeProvider({ tokens, modes: [mode], defaultMode: mode, children: Node(Content, { make }) }).render()

describe('the theme token rewrite cache', () => {
  describe.each(rewriters)('through %s', (_, rewrite) => {
    it.each(contexts.map(([label]) => label))('rewrites a string first seen in %s by each context it is read in', first => {
      // A token no other case uses, so the first read here is the one that fills the cache.
      setThemeRewriteCacheCap(SHIPPED_CAP)
      const path = `cache-${first.replace(/\W+/g, '-')}`
      const token = `theme.${path.replace(/-/g, '.')}`
      const ordered = [...contexts.filter(([label]) => label === first), ...contexts.filter(([label]) => label !== first)]
      // First sighting, second sighting (kept), then a hit.
      for (let round = 0; round < 3; round++) {
        for (const [, wrap, read, expected] of ordered) expect(read(rewrite(wrap(token)))).toBe(expected(path))
      }
    })

    it('stays at its cap under a flood of new strings, and rewrites each correctly at and past it', () => {
      setThemeRewriteCacheCap(SHIPPED_CAP)
      for (let i = 0; i < 4 * SHIPPED_CAP; i++) {
        // Each string twice, so each is kept, and the caches pass their cap several times.
        for (let sighting = 0; sighting < 2; sighting++) {
          expect(rewrite({ padding: `calc(${i}px + theme.spacing.md)` })).toEqual({ padding: `calc(${i}px + ${len('spacing-md')})` })
          expect(rewrite({ zIndex: `theme.layer.n${i}` })).toEqual({ zIndex: plain(`layer-n${i}`) })
          expect(rewrite(`color: theme.palette.c${i};`)).toBe(`color: ${plain(`palette-c${i}`)};`)
        }
        expect(kept()).toBeLessThanOrEqual(CACHES * SHIPPED_CAP)
        expect(seen()).toBeLessThanOrEqual(CACHES * SHIPPED_CAP)
      }
      expect(kept()).toBeGreaterThan(0)
    })
  })

  it('keeps a string on its second sighting, and empties a full cache before it keeps another', () => {
    setThemeRewriteCacheCap(4)
    const read = (i: number) => replaceThemeTokensWithCssVars({ padding: `calc(${i}px + theme.spacing.md)` })
    for (let i = 0; i < 4; i++) read(i)
    expect(cachedThemeRewrites()).toEqual({ kept: 0, seen: 4 })
    for (let i = 0; i < 4; i++) read(i)
    expect(cachedThemeRewrites()).toEqual({ kept: 4, seen: 0 })
    // A kept string is a hit and changes nothing.
    read(0)
    expect(cachedThemeRewrites()).toEqual({ kept: 4, seen: 0 })
    // The fifth kept string finds the cache full: it is emptied, then keeps that one.
    read(4)
    expect(read(4)).toEqual({ padding: `calc(4px + ${len('spacing-md')})` })
    expect(cachedThemeRewrites()).toEqual({ kept: 1, seen: 0 })
  })

  it('keeps the strings a page writes every time while new strings flood past them', () => {
    setThemeRewriteCacheCap(4)
    // A new object each time, as an inline call site passes, so the identity cache never answers.
    const stable = () => ({ padding: 'theme.spacing.md' })
    replaceThemeTokensWithCssVars(stable())
    replaceThemeTokensWithCssVars(stable())
    expect(kept()).toBe(1)
    for (let i = 0; i < 100; i++) {
      expect(replaceThemeTokensWithCssVars({ padding: `calc(${i}px + theme.spacing.sm)` })).toEqual({ padding: `calc(${i}px + ${len('spacing-sm')})` })
      expect(seen()).toBeLessThanOrEqual(4)
    }
    // Still kept: reading it again is a hit, which leaves both counts as they are.
    const before = cachedThemeRewrites()
    expect(replaceThemeTokensWithCssVars(stable())).toEqual({ padding: len('spacing-md') })
    expect(cachedThemeRewrites()).toEqual(before)
    expect(before.kept).toBe(1)
  })

  it('keeps nothing with a cap of 0', () => {
    setThemeRewriteCacheCap(0)
    for (let i = 0; i < 3; i++) expect(replaceThemeTokensWithCssVars({ padding: 'theme.spacing.md' })).toEqual({ padding: len('spacing-md') })
    expect(cachedThemeRewrites()).toEqual({ kept: 0, seen: 0 })
  })

  it('rewrites a string too long to keep, and does not keep it', () => {
    const long = `${'a'.repeat(300)} theme.spacing.md`
    const before = cachedThemeRewrites()
    for (let i = 0; i < 3; i++) expect(replaceThemeTokensWithCssVars({ margin: long })).toEqual({ margin: `${'a'.repeat(300)} ${len('spacing-md')}` })
    expect(cachedThemeRewrites()).toEqual(before)
  })

  it('leaves a token in a CSS text prelude for the resolver, from the cache as on the first call', () => {
    const text = '@media (min-width: theme.breakpoint.md) { padding: theme.spacing.md; }'
    const once = replaceThemeTokensWithCssVars(text)
    expect(once).toBe(`@media (min-width: theme.breakpoint.md) { padding: ${len('spacing-md')}; }`)
    expect(replaceThemeTokensWithCssVars(text)).toBe(once)
    expect(replaceThemeTokensWithCssVars(text)).toBe(once)
  })

  it('renders a kept token against the theme in scope after the theme changes', () => {
    const make = () => Div({ padding: 'theme.spacing.md', children: 'x' })
    const { container, rerender } = render(page({ spacing: { md: 16 } }, 'light', make))
    const vars = () => [...document.querySelectorAll('style[data-meonode-theme-vars]')].map(s => s.textContent).join('')
    expect(snapshot(container, 'x').join('')).toContain(`padding:${len('spacing-md')}`)
    expect(vars()).toContain('--meonode-theme-spacing-md:16;')
    expect(vars()).toContain('--meonode-theme-spacing-md--len:16px;')

    rerender(page({ spacing: { md: '2rem' } }, 'light', make))
    expect(snapshot(container, 'x').join('')).toContain(`padding:${len('spacing-md')}`)
    expect(vars()).toContain('--meonode-theme-spacing-md:2rem;')
    expect(vars()).not.toContain('--meonode-theme-spacing-md:16;')
  })

  it('renders the same with the cache on and off while tokens and modes change between renders', () => {
    const steps: [Record<string, unknown>, string][] = [
      [{ spacing: { md: 16, sm: 4 }, colors: { text: '#111' } }, 'light'],
      [{ spacing: { md: '2rem', sm: 4 }, colors: { text: '#111' } }, 'light'],
      [{ spacing: { md: '2rem', sm: 0 }, colors: { text: '#eee' } }, 'dark'],
      [{ spacing: { md: 16, sm: 4 }, colors: { text: '#111' } }, 'light'],
    ]
    // `theme.spacing.sm` is read under a property that takes a length and one that
    // does not, so a cache keyed on the text alone renders one of them wrong.
    const make = () =>
      Div({
        padding: 'theme.spacing.md',
        margin: 'theme.spacing.sm theme.spacing.md',
        zIndex: 'theme.spacing.sm',
        color: 'theme.colors.text',
        css: { '&:hover': { borderWidth: 'theme.spacing.sm' }, '& > span': 'padding: theme.spacing.md;' },
        children: 'x',
      })
    const run = (cap: number) => {
      setThemeRewriteCacheCap(cap)
      const { container, rerender, unmount } = render(page(...steps[0], make))
      const seen: string[] = []
      for (const step of steps) {
        rerender(page(...step, make))
        seen.push(...snapshot(container, 'x'))
      }
      unmount()
      return seen
    }
    const off = run(0)
    expect(off.join('')).toContain(`z-index:${plain('spacing-sm')}`)
    expect(off.join('')).toContain(`border-width:${len('spacing-sm')}`)
    expect(run(SHIPPED_CAP)).toEqual(off)
    // Again with these strings already kept, so every read is a hit.
    expect(kept() > 0).toBe(RUNTIME)
    expect(run(SHIPPED_CAP)).toEqual(off)
  })

  describe('growth', () => {
    const tokens = { spacing: { md: 16, sm: 4 }, colors: { text: '#111' } }

    it('holds the same strings after the hundredth full re-mount as after the first', () => {
      setThemeRewriteCacheCap(SHIPPED_CAP)
      const make = () => Div({ padding: 'theme.spacing.md', margin: 'theme.spacing.sm', color: 'theme.colors.text', children: 'x' })
      const sizes: number[] = []
      for (let refresh = 0; refresh < 100; refresh++) {
        const { container, unmount } = render(page(tokens, 'light', make))
        expect(snapshot(container, 'x').join('')).toContain(`padding:${len('spacing-md')}`)
        unmount()
        sizes.push(kept())
      }
      // Kept on the second mount, and the same from then on.
      expect(sizes[1] > 0).toBe(RUNTIME)
      expect(new Set(sizes.slice(1))).toEqual(new Set([sizes[1]]))
    })

    it('stays at its cap across re-mounts that each write new strings', () => {
      // A small cap, so three re-mounts of ten new strings each write more than
      // all the caches together hold, with little work.
      const cap = 4
      setThemeRewriteCacheCap(cap)
      let peak = 0
      for (let refresh = 0; refresh < 3; refresh++) {
        const make = () =>
          Div({ children: Array.from({ length: 10 }, (_, i) => Div({ key: i, padding: `calc(${refresh * 10 + i}px + theme.spacing.md)`, children: `x${i}` })) })
        const { container, unmount } = render(page(tokens, 'light', make))
        expect(snapshot(container, 'x9').join('')).toContain(`padding:calc(${refresh * 10 + 9}px + ${len('spacing-md')})`)
        unmount()
        expect(kept()).toBeLessThanOrEqual(CACHES * cap)
        expect(seen()).toBeLessThanOrEqual(CACHES * cap)
        peak = Math.max(peak, kept() + seen())
      }
      // Template literals reach the runtime rewrite compiled or not, so the caches did fill to the cap.
      expect(peak).toBeGreaterThanOrEqual(cap)
    })

    it('stops growing once every route has been visited, however often the routes change', () => {
      setThemeRewriteCacheCap(SHIPPED_CAP)
      const routes = ['home', 'docs', 'blog'].map(
        (name, r) => () =>
          Div({
            children: Array.from({ length: 20 }, (_, i) =>
              Div({ key: i, padding: `theme.spacing.md`, margin: `calc(${r * 100 + i}px + theme.spacing.sm)`, children: `${name}${i}` }),
            ),
          }),
      )
      let go: (route: number) => void = () => {}
      const App = () => {
        const [route, setRoute] = useState(0)
        go = setRoute
        return page(tokens, 'light', routes[route])
      }
      const { container } = render(createElement(App))
      const sizes: number[] = []
      for (let visit = 1; visit <= 60; visit++) {
        flushSync(() => go(visit % routes.length))
        expect(container.textContent).toContain(`${['home', 'docs', 'blog'][visit % routes.length]}19`)
        sizes.push(kept())
      }
      // From the sixth change on, every route has been seen twice.
      expect(new Set(sizes.slice(5)).size).toBe(1)
      // Template literals reach the runtime rewrite compiled or not.
      expect(sizes.at(-1)).toBeGreaterThan(0)
      expect(sizes.at(-1)).toBeLessThanOrEqual(CACHES * SHIPPED_CAP)
    })
  })

  describe('development reports', () => {
    /** Every warning one client render of a token the provider lacks, and one with no provider above, prints. */
    const reports = () => {
      __resetThemeDiagnostics()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { unmount } = render(
        page({ spacing: { md: 16 } }, 'light', () => Div({ color: 'theme.colors.missing', padding: 'theme.spacing.md', children: 'x' })),
      )
      unmount()
      const bare = render(Node(Content, { make: () => Div({ margin: 'theme.spacing.sm', children: 'y' }) }).render())
      bare.unmount()
      const printed = warn.mock.calls.map(call => String(call[0]))
      warn.mockRestore()
      return printed
    }

    afterEach(() => __resetThemeDiagnostics())

    it('reports on a render whose strings are all cache hits as on the first, and as with no cache', () => {
      setThemeRewriteCacheCap(0)
      const uncached = reports()
      expect(uncached.some(m => m.includes('theme.colors.missing') && m.includes('is not defined by the active theme'))).toBe(true)
      expect(uncached.some(m => m.includes('theme.spacing.sm') && m.includes('no ThemeProvider'))).toBe(true)

      setThemeRewriteCacheCap(SHIPPED_CAP)
      expect(reports()).toEqual(uncached)
      expect(reports()).toEqual(uncached)
      const before = cachedThemeRewrites()
      expect(before.kept > 0).toBe(RUNTIME)
      // Every string is kept now, so this render reads only hits.
      expect(reports()).toEqual(uncached)
      expect(cachedThemeRewrites()).toEqual(before)
    })
  })
})
