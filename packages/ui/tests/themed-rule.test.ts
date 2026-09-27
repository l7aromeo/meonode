// @vitest-environment node
//
// `ThemedRule` runs where the theme is — the server pass of the client tree, and
// the browser — and writes the rule a server component handed it for a css key
// holding a theme token. `StyledRenderer` resolves the same keys for a client
// component. Neither may ever hand a token to Emotion in a key.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeStyles } from '@emotion/serialize'
import createCache from '@emotion/cache'
import { Div, ThemeProvider } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { compileServerEmotionRule } from '@src/util/server-emotion.util.js'
import { ThemedRule } from '@src/components/styled-renderer.client.js'
import { __resetThemeDiagnostics } from '@src/util/theme-diagnostics.util.js'

const warnings: string[] = []
let originalWarn: typeof console.warn

beforeEach(() => {
  __resetThemeDiagnostics()
  warnings.length = 0
  originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(String(args[0]))
  }
})

afterEach(() => {
  console.warn = originalWarn
  vi.unstubAllEnvs()
  __resetThemeDiagnostics()
})

const unresolved = () => warnings.filter(text => text.includes('could not be resolved'))
const themed = (children: unknown) =>
  renderToString(
    ThemeProvider({
      tokens: { breakpoint: { wide: '1000px', columns: 3 }, size: { lg: '12px' } },
      modes: ['light'],
      defaultMode: 'light',
      children,
    } as never).render() as never,
  )
const styleText = (html: string) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('')
/** The text of the rules written for a class, without the provider's variables. */
const ruleText = (html: string) => [...html.matchAll(/<style[^>]*href="meonode-css-[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('')

describe('ThemedRule under a ThemeProvider', () => {
  it.each([
    ['@media (width >= theme.breakpoint.wide)', '@media (width >= 1000px){.meonode-css-x{color:crimson;}}'],
    ['@container (min-width: theme.breakpoint.wide)', '@container (min-width: 1000px){.meonode-css-x{color:crimson;}}'],
    ['@supports (width: theme.breakpoint.wide)', '@supports (width: 1000px){.meonode-css-x{color:crimson;}}'],
    ['&[data-size="theme.size.lg"]', '.meonode-css-x[data-size="12px"]{color:crimson;}'],
  ])('writes %s with the theme’s value, for the class it was given', (key, rule) => {
    const html = themed(createElement(ThemedRule, { className: 'meonode-css-x', css: { [key]: { color: 'crimson' } } }))

    expect(styleText(html)).toContain(rule)
    expect(styleText(html)).not.toContain('theme.')
  })

  it('writes a nested at-rule inside a selector inside an at-rule', () => {
    const css = { '@media (min-width: 600px)': { '&:hover': { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } } } }
    const html = themed(createElement(ThemedRule, { className: 'meonode-css-x', css }))

    expect(styleText(html)).toContain('@media (min-width: 600px){@media (width >= 1000px){.meonode-css-x:hover{color:crimson;}}}')
  })

  it('leaves out a key naming a value the theme lacks, and reports it', () => {
    const html = themed(createElement(ThemedRule, { className: 'meonode-css-x', css: { '@media (width >= theme.breakpoint.huge)': { color: 'crimson' } } }))

    expect(styleText(html)).not.toContain('theme.')
    expect(unresolved()).toHaveLength(1)
  })
})

describe('ThemedRule vendor prefixes', () => {
  it('writes the prefixes Emotion writes, and none it leaves out', () => {
    const css = { '@media (width >= theme.breakpoint.wide)': { display: 'grid', tabSize: 4, userSelect: 'none', '&::placeholder': { color: 'gray' } } }
    const text = ruleText(themed(createElement(ThemedRule, { className: 'meonode-css-x', css })))

    expect(text).toBe(
      '@media (width >= 1000px){.meonode-css-x{display:grid;tab-size:4;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;}' +
        '.meonode-css-x::-webkit-input-placeholder{color:gray;}.meonode-css-x::-moz-placeholder{color:gray;}.meonode-css-x:-ms-input-placeholder{color:gray;}.meonode-css-x::placeholder{color:gray;}}',
    )
  })
})

describe('ThemedRule given a composition', () => {
  it('writes the element’s own css and the handed class’s in order, as one class', () => {
    const css = [{ color: 'rgb(0, 128, 128)' }, { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } }]
    const text = styleText(themed(createElement(ThemedRule, { className: 'meonode-css-x', css })))

    expect(text).toContain('.meonode-css-x{color:rgb(0, 128, 128);}@media (width >= 1000px){.meonode-css-x{color:crimson;}}')
  })
})

describe('ThemedRule with no ThemeProvider', () => {
  const css = { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } }

  it('writes nothing, and names the key once in development', () => {
    expect(renderToString(createElement(ThemedRule, { className: 'meonode-css-x', css }))).toBe('')
    renderToString(createElement(ThemedRule, { className: 'meonode-css-y', css }))

    expect(unresolved()).toHaveLength(1)
    expect(unresolved()[0]).toContain('@media (width >= theme.breakpoint.wide)')
  })

  it('stays silent about it in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    __resetThemeDiagnostics()
    renderToString(createElement(ThemedRule, { className: 'meonode-css-x', css }))

    expect(unresolved()).toEqual([])
  })
})

describe('StyledRenderer with no ThemeProvider', () => {
  it('hands no token to Emotion in a key', () => {
    const html = renderToString(
      Div({ css: { color: 'red', '@media (width >= theme.breakpoint.wide)': { color: 'crimson' } }, children: 'x' }).render() as never,
    )

    expect(styleText(html)).toContain('color:red')
    expect(styleText(html)).not.toContain('theme.')
    expect(unresolved()).toHaveLength(1)
  })
})

describe('ThemedRule given css text', () => {
  it('resolves a token in a prelude and keeps the declarations', () => {
    const css = 'color: var(--meonode-theme-primary); @media (min-width: theme.breakpoint.wide) { color: crimson; }'
    const text = ruleText(themed(createElement(ThemedRule, { className: 'meonode-css-x', css })))

    expect(text).toBe('.meonode-css-x{color:var(--meonode-theme-primary);}@media (min-width: 1000px){.meonode-css-x{color:crimson;}}')
  })

  it('resolves css text inside an array', () => {
    const css = [{ padding: 4 }, '@media (min-width: theme.breakpoint.wide) { color: crimson; }']
    const text = ruleText(themed(createElement(ThemedRule, { className: 'meonode-css-x', css })))

    expect(text).toBe('.meonode-css-x{padding:4px;}@media (min-width: 1000px){.meonode-css-x{color:crimson;}}')
  })

  it('leaves out a block whose prelude names a value the theme lacks, and reports it', () => {
    const css = 'color: red; @media (min-width: theme.breakpoint.huge) { color: crimson; }'
    const text = ruleText(themed(createElement(ThemedRule, { className: 'meonode-css-x', css })))

    expect(text).toBe('.meonode-css-x{color:red;}')
    expect(unresolved()).toHaveLength(1)
    expect(unresolved()[0]).toContain('@media (min-width: theme.breakpoint.huge)')
  })
})

describe('what ThemedRule treats as a token in a key', () => {
  it('keeps a selector naming the class `.theme.accent` as written', () => {
    const css = { '& .theme.accent': { color: 'crimson' }, '@media (width >= theme.breakpoint.wide)': { color: 'blue' } }
    const text = ruleText(themed(createElement(ThemedRule, { className: 'meonode-css-x', css })))

    expect(text).toBe('.meonode-css-x .theme.accent{color:crimson;}@media (width >= 1000px){.meonode-css-x{color:blue;}}')
    expect(unresolved()).toEqual([])
  })

  it('writes a numeric token in a condition as the number the theme holds', () => {
    const css = { '@media (min-resolution: theme.breakpoint.columns)': { color: 'crimson' } }
    const text = ruleText(themed(createElement(ThemedRule, { className: 'meonode-css-x', css })))

    expect(text).toBe('@media (min-resolution: 3){.meonode-css-x{color:crimson;}}')
  })
})

describe('the server rule and ThemedRule together', () => {
  /** The css as an Emotion cache writes it for one class, with the theme's values written in. */
  const emotionRule = (className: string, css: Record<string, unknown>) => {
    const cache = createCache({ key: 'reference' })
    cache.compat = true
    const serialized = serializeStyles([css as never])
    cache.insert(`.${className}`, serialized, cache.sheet, true)
    return cache.inserted[serialized.name] as string
  }

  it.each([
    [
      'a plain block after the themed one, conflicting with it',
      {
        color: 'black',
        '@media (width >= theme.breakpoint.wide)': { color: 'crimson' },
        '@media (min-width: 600px)': { color: 'blue' },
      },
    ],
    [
      'plain blocks on both sides, a declaration after them',
      {
        '&:hover': { color: 'green' },
        '@media (width >= theme.breakpoint.wide)': { color: 'crimson', '&:hover': { color: 'teal' } },
        '&:focus': { color: 'blue' },
        color: 'black',
      },
    ],
    [
      'properties Emotion prefixes, and ones it leaves alone, on both sides',
      {
        display: 'grid',
        userSelect: 'none',
        '@media (width >= theme.breakpoint.wide)': { display: 'flex', tabSize: 4, '&::placeholder': { color: 'gray' } },
        '&:read-only': { justifySelf: 'center' },
      },
    ],
  ])('write what Emotion writes for the whole css: %s', (_, css) => {
    const { plain, themed: rest } = ThemeUtil.splitThemedCss(css as never)
    const rule = compileServerEmotionRule(plain, undefined, { identity: css as never })!
    const client = ruleText(themed(createElement(ThemedRule, { className: rule.ownClassName, css: rest })))
    const resolved = JSON.parse(JSON.stringify(css).replaceAll('theme.breakpoint.wide', '1000px'))

    expect(rule.cssText + client).toBe(emotionRule(rule.ownClassName, resolved))
  })
})

describe('StyledRenderer under a ThemeProvider', () => {
  it('writes a resolved key where it was written, not after the entries that follow it', () => {
    const css = { '@media (width >= theme.breakpoint.wide)': { color: 'crimson' }, '@media (min-width: 600px)': { color: 'blue' } }
    const Inner = () => Div({ css, children: 'x' }).render()
    const text = styleText(themed(createElement(Inner)))

    expect(text.indexOf('@media (width >= 1000px)')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('@media (width >= 1000px)')).toBeLessThan(text.indexOf('@media (min-width: 600px)'))
  })
})

describe('where ThemedRule is defined', () => {
  // In a Next build that has a `'use cache'` function beside client modules
  // importing the package, `ThemedRule` in a client module of its own read a
  // ThemeContext no provider filled, on the server and in the browser, and wrote
  // nothing. In the StyledRenderer module it reads the provider's.
  const src = join(import.meta.dirname, '../src')
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]))

  it('is the StyledRenderer module, and the node core imports it from there', () => {
    const defining = files(src).filter(file => /export function ThemedRule\b/.test(readFileSync(file, 'utf8')))

    expect(defining.map(file => file.slice(src.length + 1))).toEqual(['components/styled-renderer.client.ts'])
    expect(readFileSync(join(src, 'core.node.ts'), 'utf8')).toMatch(
      /import StyledRenderer, \{ ThemedRule \} from '@src\/components\/styled-renderer\.client\.js'/,
    )
  })
})
