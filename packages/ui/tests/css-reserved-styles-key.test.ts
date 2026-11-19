// @vitest-environment jsdom
//
// Emotion reserves the `styles` key for serialized styles: it writes any object
// whose `styles` is set from that key alone, whatever it holds. A string there
// is CSS text, as `css()` returns it. Anything else would render nothing, drop
// every other declaration on the object, and crash Emotion's own development
// build, so the key is left out, at any depth, and the rest of the object
// renders. Development reports it once, naming where it sits; production stays
// silent. Emotion's production build is covered in dev-mode-environments.test.ts.
import { css } from '@emotion/react'
import { createNode, Div, ThemeProvider, type Theme } from '@src/main.js'
import { __resetThemeDiagnostics } from '@src/util/theme-diagnostics.util.js'
import { cleanup, render } from '@testing-library/react'
import { asThemeProps } from './_theme-props.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  __resetThemeDiagnostics()
})

const RESERVED = 'has a `styles` key that holds no string'

/** Every warning written while `build` runs. */
const warningsFrom = (build: () => unknown) => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  build()
  return warn.mock.calls.map(call => call.join(' '))
}

it.each([
  ['at the top of css', { styles: { paddingTop: 4 }, paddingBottom: 8 }, '`css`'],
  ['under a selector', { '&:hover': { styles: { color: 'red' }, margin: 2 } }, '`css["&:hover"]`'],
  ['in a css array', [{ color: 'blue' }, { styles: { color: 'red' }, margin: 2 }], '`css[1]`'],
])('reports a styles key holding no string %s, naming where it sits and that it was left out', (_, value, where) => {
  const warnings = warningsFrom(() => Div({ css: value as never, children: 'x' }))
  expect(warnings).toHaveLength(1)
  expect(warnings[0]).toContain(`${where} ${RESERVED}`)
  expect(warnings[0]).toContain('Emotion reserves `styles`')
  expect(warnings[0]).toContain('left out')
})

it('reports each place once', () => {
  const value = { '&:hover': { styles: { color: 'red' }, margin: 2 } }
  expect(warningsFrom(() => [Div({ css: value, children: 'x' }), Div({ css: value, children: 'y' })] as never)).toHaveLength(1)
})

// An inline literal is a new object on every render.
it('reports a place once when each render writes a new object there', () => {
  const build = () => Div({ css: { '&:hover': { styles: { color: 'red' }, margin: 2 } } as never, children: 'x' })
  expect(warningsFrom(() => [build(), build()])).toHaveLength(1)
})

// Two components can make the same mistake at the same path with other keys.
it.each([
  ['in what styles holds', { styles: { color: 'red' }, margin: 2 }, { styles: { background: 'blue' }, margin: 2 }],
  ['beside it', { styles: { color: 'red' }, margin: 2 }, { styles: { color: 'red' }, padding: 2 }],
])('reports two objects at the same place that differ %s each once', (_, header, footer) => {
  const warnings = warningsFrom(() => [
    Div({ css: { '&:hover': header } as never, children: 'h' }),
    Div({ css: { '&:hover': footer } as never, children: 'f' }),
  ])
  expect(warnings).toHaveLength(2)
  expect(warnings.every(warning => warning.includes(`\`css["&:hover"]\` ${RESERVED}`))).toBe(true)
})

// A factory's css and the call site's are checked before they combine, so the
// first report names the call site's own css. The combined value holds the same
// object at another place, which is not reported again.
it("reports a call site's key once beside a factory's css, where the call site wrote it", () => {
  const Card = createNode('div', { css: { color: 'blue' } })
  const warnings = warningsFrom(() => render(Card({ css: [{ styles: { color: 'red' }, margin: 2 }] as never, children: 'x' }).render()))
  expect(warnings).toHaveLength(1)
  expect(warnings[0]).toContain(`\`css[0]\` ${RESERVED}`)
})

// What a theme function returns exists only once the theme resolves it, so it is
// reported there, without a place in the css as written.
it('reports a styles key holding no string that a theme function returns, once, and renders the rest', () => {
  const theme: Theme = { mode: 'light', system: { spacing: { md: 16 } } }
  const tree = () =>
    ThemeProvider({
      ...asThemeProps(theme),
      children: Div({ css: { '& > span': () => ({ styles: { marginTop: 61 }, paddingLeft: 61 }) } as never, children: 'x' }),
    }).render()
  const warnings = warningsFrom(() => [render(tree()), render(tree())])
  expect(warnings).toEqual([expect.stringContaining('A theme function returned a `styles` key that holds no string.')])
  expect(warnings[0]).toContain('left out')
  const rules = [...document.head.querySelectorAll('style')].map(s => s.textContent).join('')
  expect(rules).toContain('padding-left:61px;')
  expect(rules).not.toContain('margin-top:61px')
})

it("reports nothing for a css() result, whose styles is Emotion's CSS text", () => {
  expect(warningsFrom(() => Div({ css: css({ padding: 4 }), children: 'x' }))).toEqual([])
})

it('reports nothing in production', () => {
  vi.stubEnv('NODE_ENV', 'production')
  __resetThemeDiagnostics()
  expect(warningsFrom(() => Div({ css: { '&:hover': { styles: { color: 'red' }, margin: 2 } } as never, children: 'x' }))).toEqual([])
})

// What leaving the key out is for: Emotion writes the rest of the object. Each
// case's values are its own, since Emotion's style tags outlive a test. A server
// render, which needs Emotion outside a browser, is covered in
// dev-mode-environments.test.ts, and a server component in rsc-integration.test.ts.
describe('renders the declarations beside a styles key holding no string, leaving the key out', () => {
  const theme: Theme = { mode: 'light', system: { spacing: { md: 16 } } }
  const tree = (value: unknown, withProvider: boolean) => {
    const element = Div({ css: value as never, children: 'x' })
    return (withProvider ? ThemeProvider({ ...asThemeProps(theme), children: element }) : element).render()
  }
  // [label, css for a value n, a declaration kept, a declaration left out]
  const shapes: [string, (n: number) => unknown, (n: number) => string, (n: number) => string][] = [
    ['at the top of css', n => ({ styles: { paddingTop: n }, paddingBottom: n }), n => `padding-bottom:${n}px;`, n => `padding-top:${n}px`],
    [
      'under a selector',
      n => ({ color: 'navy', '& > span': { styles: { marginTop: n }, paddingLeft: n } }),
      n => `padding-left:${n}px;`,
      n => `margin-top:${n}px`,
    ],
    ['in a css array', n => [{ color: 'teal' }, { styles: { marginLeft: n }, marginRight: n }], n => `margin-right:${n}px;`, n => `margin-left:${n}px`],
    [
      'beside a theme token',
      n => ({ styles: { borderTopWidth: n }, paddingRight: 'theme.spacing.md', borderBottomWidth: n }),
      n => `border-bottom-width:${n}px;`,
      n => `border-top-width:${n}px`,
    ],
  ]
  let next = 100

  describe.each(shapes)('%s', (_, shape, kept, left) => {
    it.each([false, true])('provider: %s', withProvider => {
      const n = next++
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
      render(tree(shape(n), withProvider))
      const rules = [...document.head.querySelectorAll('style')].map(s => s.textContent).join('')
      expect(rules).toContain(kept(n))
      expect(rules).not.toContain(left(n))
    })
  })
})
