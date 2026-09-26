import { Div, Node, type NodeInstance, type Theme, ThemeProvider } from '@src/main.js'
import { cleanup, render } from '@testing-library/react'
import { css as emotionCss, keyframes } from '@emotion/react'
import { asThemeProps } from './_theme-props.js'

// Style tags are left in place: Emotion inserts a class once per cache, so removing
// them would leave a later test that reuses a class with no rule to read.
afterEach(cleanup)

type CssValue = NonNullable<Parameters<typeof Div>[0]>['css']

const theme: Theme = { mode: 'light', system: { colors: { primary: 'rgb(255, 0, 0)' }, font: { body: 'Inter' } } }

/**
 * The rules Emotion emitted for the rendered div's class, keyed by what follows
 * the class name in the selector (`''` for the element itself, `':hover'`, …).
 * Read from the style text: a rule aimed at the wrong selector — `.css-x 0` — is
 * exactly the defect, and a style-rule matcher would report it as "no match"
 * rather than show where it went.
 */
const emittedRules = (cssValue: CssValue, flat: Record<string, unknown> = {}, themed = false): Record<string, string> => {
  const node = Div({ children: 'x', ...flat, css: cssValue })
  const { container } = render((themed ? ThemeProvider({ ...asThemeProps(theme), children: node }) : node).render())
  const div = [...container.querySelectorAll('div')].find(d => d.textContent === 'x' && d.children.length === 0)!
  const className = [...div.classList].find(c => c.startsWith('css-'))
  if (className === undefined) return {}
  const text = [...document.head.querySelectorAll('style')].map(s => s.textContent).join('')
  const rules: Record<string, string> = {}
  for (const [, suffix, body] of text.matchAll(new RegExp(`\\.${className}([^{]*)\\{([^}]*)\\}`, 'g'))) rules[suffix] = (rules[suffix] ?? '') + body
  return rules
}

const bounce = keyframes`from { opacity: 0; } to { opacity: 1; }`

describe('css prop shapes other than a plain object', () => {
  // [label, css value, declarations the element's own rule must carry, extra selector → declarations]
  const shapes: [string, CssValue, string[], Record<string, string[]>][] = [
    ['array of objects', [{ margin: 4 }, { '&:hover': { color: 'red' } }], ['margin:4px'], { ':hover': ['color:red'] }],
    ['nested arrays', [[{ margin: 4 }], [[{ borderWidth: 1 }]]], ['margin:4px', 'border-width:1px'], {}],
    ['array holding a css() result', [emotionCss({ margin: 4 }), { borderWidth: 1 }], ['margin:4px', 'border-width:1px'], {}],
    ['css() result', emotionCss({ margin: 4, '&:hover': { color: 'red' } }), ['margin:4px'], { ':hover': ['color:red'] }],
    ['string', 'margin: 4px; &:hover { color: red; }', ['margin:4px'], { ':hover': ['color:red'] }],
    ['object with a keyframes animation', { animation: `${bounce} 1s linear` }, [`animation:${bounce.name} 1s linear`], {}],
    ['object with a keyframes animationName', { animationName: bounce }, [`animation-name:${bounce.name}`], {}],
  ]

  describe.each([
    ['alone', {}, []],
    ['with flat CSS props on the same node', { padding: 8 }, ['padding:8px']],
  ] as const)('%s', (_, flat, flatDecls) => {
    it.each(shapes)('%s', (_, cssValue, decls, extra) => {
      const rules = emittedRules(cssValue, flat)
      expect(Object.keys(rules).sort()).toEqual(['', ...Object.keys(extra)].sort())
      // The runtime's defaults survive too: a spread `css()` result used to drop them.
      for (const decl of ['min-height:0', 'min-width:0', ...flatDecls, ...decls]) expect(rules['']).toContain(`${decl};`)
      for (const [suffix, extraDecls] of Object.entries(extra)) {
        for (const decl of extraDecls) expect(rules[suffix]).toContain(`${decl};`)
      }
    })
  })

  it.each([false, null, undefined])('css: %s renders the flat props alone', cssValue => {
    expect(emittedRules(cssValue, { padding: 8 })).toEqual(emittedRules(undefined, { padding: 8 }))
    expect(emittedRules(cssValue, { padding: 8 })['']).toContain('padding:8px;')
  })

  it('puts the defaults before a composed css, so the author wins', () => {
    // A declaration inside a string is invisible to the default logic, which sees no
    // flexShrink and emits its default 0. It still loses, because it comes first.
    const rule = emittedRules('flex-shrink: 2;')['']
    expect([...rule.matchAll(/(?:^|;)flex-shrink:([^;]+)/g)].map(m => m[1])).toEqual(['0', '2'])
  })

  describe('under a ThemeProvider', () => {
    it.each<[string, CssValue]>([
      ['function receiving the theme', (t: Theme) => ({ color: t.system.colors.primary })],
      ['function ignoring the theme', () => ({ margin: 4, color: 'rgb(255, 0, 0)' })],
      ['array holding a function', [{ margin: 4 }, (t: Theme) => ({ color: t.system.colors.primary })]],
      ['array holding a theme token', [{ margin: 4 }, { color: 'theme.colors.primary' }]],
    ])('%s', (_, cssValue) => {
      const rules = emittedRules(cssValue, { padding: 8 }, true)
      expect(Object.keys(rules)).toEqual([''])
      expect(rules['']).toContain('padding:8px;')
      expect(rules['']).toMatch(/color:(rgb\(255, 0, 0\)|var\(--meonode-theme-colors-primary\));/)
    })
  })

  // The server converts `theme.*` strings in any array. On the client, a node that is
  // a prop of its provider happens to be converted with the provider's props; one
  // rendered from inside a React component is not, so the class hash differed from
  // the server's. The expected classes are the server's, locked in css-prop-ssr.
  describe('theme strings inside arrays match the server', () => {
    const Wrap = ({ make }: { make: () => NodeInstance }) => make().render()
    const renderUnderComponent = (cssValue: CssValue) => {
      const { container } = render(
        ThemeProvider({ ...asThemeProps(theme), children: Node(Wrap, { make: () => Div({ children: 'x', css: cssValue }) }) }).render(),
      )
      return [...container.querySelectorAll('div')].find(d => d.textContent === 'x' && d.children.length === 0)!
    }

    it.each<[string, CssValue, string]>([
      ['a fallback list under one property', { fontFamily: ['Arial', 'theme.font.body'] } as never, 'css-1me33pq'],
      ['a string css', 'color: theme.colors.primary;', 'css-kk9f6w'],
      ['a string inside a composed css', [{ margin: 4 }, 'color: theme.colors.primary;'], 'css-74wits'],
    ])('%s', (_, cssValue, serverClass) => {
      expect(renderUnderComponent(cssValue).classList).toContain(serverClass)
    })
  })

  describe('theme functions with no provider are dropped on the client', () => {
    it.each<[string, CssValue, Record<string, unknown>]>([
      ['object value', { margin: 4, color: (t: Theme) => t.system.colors.primary }, {}],
      ['array item', [{ margin: 4 }, (t: Theme) => ({ color: t.system.colors.primary })], {}],
      ['top-level css', (t: Theme) => ({ color: t.system.colors.primary }), { margin: 4 }],
      ['function ignoring its theme', { margin: 4, color: () => 'red' }, {}],
    ])('%s', (_, cssValue, flat) => {
      const rules = emittedRules(cssValue, flat)
      const text = Object.values(rules).join('')
      expect(text).not.toContain('=>')
      expect(text).not.toContain('color:')
      expect(rules['']).toContain('margin:4px;')
    })
  })

  // The shape a factory composing its css with a call site's produces: the whole
  // array becomes the second entry of `[flatCssProps, css]`. The order is the one
  // the plain-map path gives — flat props, then the factory, then the call site.
  it('composes flat props, then each css entry, in order', () => {
    const rule = emittedRules([{ color: 'red' }, { color: 'blue' }], { color: 'green' })['']
    expect([...rule.matchAll(/(?:^|;)color:([^;]+)/g)].map(m => m[1])).toEqual(['green', 'red', 'blue'])
  })
})
