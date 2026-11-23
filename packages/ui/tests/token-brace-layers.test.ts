// @vitest-environment node
//
// A style value holding a theme token and a brace is a property value, not CSS
// text: the token is a placeholder for the value, so it becomes its variable and
// the rest of the value is written as it is, as `@meonode/compiler` writes it at
// build time. Every layer must give the node the same class: a client component
// with and without a ThemeProvider, a server component, and, under
// `MEONODE_COMPILED`, the same call site compiled. Moving a component between
// them then never changes its CSS.
//
// Cases are generated: each value shape (token before, after or inside a brace,
// several tokens and braces) in each place a value is written (a flat prop, `css`,
// a nested selector, an at-rule, a fallback list of a property or a custom
// property). The client side is a server render of the client graph, read from
// Emotion's cache; the server side loads the runtime as the React Server
// Components layer does (see `react-server-layer.test.ts`) and reads the class
// each element carries.
//
// CSS text is unchanged: a token in a prelude or a selector there still needs
// the theme's concrete value, and a block whose prelude names a value the theme
// lacks is still left out.
import { existsSync, globSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from '@swc/core'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const REACT_SERVER_ENTRY = path.join(path.dirname(require.resolve('react/package.json')), 'react.react-server.js')
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const CLIENT_MODULES = globSync('**/*.ts', { cwd: SRC })
  .filter(file => readFileSync(path.join(SRC, file), 'utf8').startsWith("'use client'"))
  .map(file => `@src/${file.replace(/\.ts$/, '.js')}`)

/** Whether the suite runs compiled (see `vitest.compiled.config.ts`), which adds the compiled call sites. */
const COMPILED = process.env.MEONODE_COMPILED === '1'
/** The compiler's wasm, where `vitest.compiled.config.ts` finds it. */
const WASM = [
  process.env.MEONODE_COMPILER_WASM,
  path.resolve(SRC, '../node_modules/@meonode/compiler/meonode_swc_plugin.wasm'),
  path.resolve(SRC, '../../compiler/npm/meonode_swc_plugin.wasm'),
].find(file => file !== undefined && existsSync(file))

/** The client's Emotion cache key, and the server layer's. */
const CLIENT_KEY = 'css'
const SERVER_KEY = 'meonode-css'

/** Attribute marking the node under test. */
const CASE_ATTRIBUTE = 'data-case'

/** The theme under the ThemeProvider: every token the values use, and `wide` and `sel` for CSS text. `huge` is left out. */
const TOKENS = { primary: 'red', a: 'blue', c: 'green', wide: '100px', sel: '.on' }

/** Values holding a theme token and a brace. */
const VALUES = ['theme.primary {a}', '{a} theme.primary', 'x {theme.primary}', 'theme.a {b} theme.c', 'theme.primary }', 'theme.primary { a: b; }']

type Places = Record<string, (value: string) => Record<string, unknown>>

/** Where a value is written, as props for `Div`. */
const PLACES: Places = {
  'flat prop': value => ({ color: value }),
  css: value => ({ css: { color: value } }),
  'nested selector': value => ({ css: { '&:hover': { color: value } } }),
  'at-rule': value => ({ css: { '@media (min-width: 1px)': { color: value } } }),
  'length prop': value => ({ padding: value }),
  'fallback list': value => ({ css: { color: ['red', value] } }),
  'custom property fallback list': value => ({ css: { '--x': ['red', value] } }),
}

/**
 * Where a theme function returns the value. Only a client under a ThemeProvider
 * calls one: with no theme, each layer leaves the function out.
 */
const FUNCTION_PLACES: Places = {
  'flat prop function': value => ({ color: () => value }),
  'css function': value => ({ css: { color: () => value } }),
}

/** CSS text holding `token` in a prelude or a selector, as props for `Div`. */
const CSS_TEXT: Record<string, { token: string; resolved: string; at: (token: string) => Record<string, unknown> }> = {
  'css string': { token: 'theme.wide', resolved: '(min-width: 100px)', at: token => ({ css: `color: red; @media (min-width: ${token}) { color: crimson; }` }) },
  'string item of a css array': {
    token: 'theme.wide',
    resolved: '(min-width: 100px)',
    at: token => ({ css: [{ color: 'red' }, `@media (min-width: ${token}) { color: crimson; }`] }),
  },
  'at-rule prelude': {
    token: 'theme.wide',
    resolved: '(min-width: 100px)',
    at: token => ({ css: { color: 'red', [`@media (min-width: ${token})`]: { color: 'crimson' } } }),
  },
  selector: { token: 'theme.sel', resolved: ':is(.on)', at: token => ({ css: { color: 'red', [`&:is(${token})`]: { color: 'crimson' } } }) },
}
/** A token the theme lacks. */
const MISSING_TOKEN = 'theme.huge'

interface BraceCase {
  name: string
  props: Record<string, unknown>
  value: string
}

const casesOf = (places: Places): BraceCase[] =>
  Object.entries(places).flatMap(([place, at]) => VALUES.map(value => ({ name: `${place}: ${JSON.stringify(value)}`, props: at(value), value })))
const cases = casesOf(PLACES)
const functionCases = casesOf(FUNCTION_PLACES)

type Factory = (props: unknown) => { render(): ReactNode }

function ownName(className: unknown, key: string): string | undefined {
  if (typeof className !== 'string') return undefined
  const own = className.split(/\s+/).filter(c => c.startsWith(`${key}-`))
  return own.length === 1 ? own[0].slice(key.length + 1) : undefined
}

/** The props a case renders with. */
const propsOf = (props: Record<string, unknown>) => ({ ...props, [CASE_ATTRIBUTE]: '', children: 'x' })

/**
 * The case's call site compiled, as a function of `Div`: the props are written
 * out, so the compiler sees them as the author wrote them.
 */
function compiledSite(c: BraceCase): (div: Factory) => { render(): ReactNode } {
  if (WASM === undefined) throw new Error('Compiled cases need the @meonode/compiler wasm artifact')
  const source = `import { Div } from '@src/main.js'\nexport default Div(${JSON.stringify(propsOf(c.props))})\n`
  const { code } = transformSync(source, {
    filename: 'case.ts',
    jsc: { target: 'es2022', parser: { syntax: 'typescript' }, experimental: { plugins: [[WASM, { factoryModules: ['@src/main.js'] }]] } },
  })
  // A site the compiler left alone would compare the runtime with itself. A
  // token in an array item is left to the runtime, so only the marker is checked.
  if (!code.includes('__meo$')) throw new Error(`the compiler did not compile ${c.name}:\n${code}`)
  const body = code.replace(/^import .*$/m, '').replace('export default', 'return')
  return div => new Function('Div', body)(div)
}

interface ClientSide {
  name: string | undefined
  styles: string | undefined
}

/** Per case: the client with no ThemeProvider, the client under one, and the server layer. */
let client: ClientSide[]
let themed: ClientSide[]
let server: (string | undefined)[]
/** Per case, when compiled: the compiled call site on the client and on the server layer. */
let compiledClient: ClientSide[]
let compiledServer: (string | undefined)[]
/** Per function case: the client under a ThemeProvider. */
let themedFunctions: ClientSide[]
/** Per CSS text case: the client under a theme holding its token, under a theme lacking it, and with none. */
let cssText: { holding: ClientSide; lacking: ClientSide; none: ClientSide }[]

beforeAll(async () => {
  const exportsOf = new Map<string, string[]>()
  for (const specifier of CLIENT_MODULES) exportsOf.set(specifier, Object.keys(await import(specifier)))
  const { Div, ThemeProvider } = (await import('@src/main.js')) as unknown as { Div: Factory; ThemeProvider: Factory }
  const { renderToString } = await import('react-dom/server')
  const createCache = (await import('@emotion/cache')).default
  const { CacheProvider } = await import('@emotion/react')
  const render = (node: { render(): ReactNode }, withTheme: boolean): ClientSide => {
    const cache = createCache({ key: CLIENT_KEY })
    const byName = new Map<string, string>()
    const insert = cache.insert.bind(cache)
    cache.insert = (selector, serialized, sheet, shouldCache) => {
      byName.set(serialized.name, serialized.styles)
      return insert(selector, serialized, sheet, shouldCache)
    }
    const tree = withTheme ? ThemeProvider({ tokens: TOKENS, modes: ['light'], defaultMode: 'light', children: node }) : node
    const html = renderToString(createElement(CacheProvider, { value: cache }, tree.render()))
    const tag = html.match(new RegExp(`<div[^>]*${CASE_ATTRIBUTE}[^>]*>`))?.[0]
    const name = ownName(tag?.match(/\sclass="([^"]*)"/)?.[1], CLIENT_KEY)
    return { name, styles: name === undefined ? undefined : byName.get(name) }
  }
  const sites = COMPILED ? cases.map(compiledSite) : []
  client = cases.map(c => render(Div(propsOf(c.props)), false))
  themed = cases.map(c => render(Div(propsOf(c.props)), true))
  compiledClient = sites.map(site => render(site(Div), false))
  themedFunctions = functionCases.map(c => render(Div(propsOf(c.props)), true))
  cssText = Object.values(CSS_TEXT).map(({ token, at }) => ({
    holding: render(Div(propsOf(at(token))), true),
    lacking: render(Div(propsOf(at(MISSING_TOKEN))), true),
    none: render(Div(propsOf(at(token))), false),
  }))

  vi.resetModules()
  vi.doMock('react', () => {
    const reactServer = require(REACT_SERVER_ENTRY)
    return { ...reactServer, default: reactServer }
  })
  for (const [specifier, names] of exportsOf) {
    vi.doMock(specifier, () =>
      Object.fromEntries(
        names.map(name => [
          name,
          Object.assign(
            function ClientReference() {
              throw new Error(`client reference ${specifier}#${name} was called on the server`)
            },
            { $$typeof: Symbol.for('react.client.reference') },
          ),
        ]),
      ),
    )
  }
  const { Div: ServerDiv } = (await import('@src/main.js')) as unknown as { Div: Factory }
  const elements = (node: unknown): ReactElement<Record<string, unknown>>[] =>
    Array.isArray(node)
      ? node.flatMap(elements)
      : isValidElement(node)
        ? [node as ReactElement<Record<string, unknown>>, ...elements((node.props as { children?: unknown }).children)]
        : []
  const serverName = (node: { render(): ReactNode }) =>
    ownName(elements(node.render()).find(e => e.type === 'div' && CASE_ATTRIBUTE in e.props)?.props.className, SERVER_KEY)
  server = cases.map(c => serverName(ServerDiv(propsOf(c.props))))
  compiledServer = sites.map(site => serverName(site(ServerDiv)))
})

afterAll(() => {
  vi.doUnmock('react')
  for (const specifier of CLIENT_MODULES) vi.doUnmock(specifier)
  vi.resetModules()
})

/** The value's tokens are written as variables, and each of its braces is still there. */
function expectValueWritten(styles: string | undefined, value: string) {
  expect(styles).toBeDefined()
  expect(styles).not.toContain('theme.')
  expect(styles).toContain('var(--meonode-theme-')
  const braces = (value.match(/[{}]/g) ?? []).length
  expect((styles?.match(/[{}]/g) ?? []).length).toBeGreaterThanOrEqual(braces)
}

describe('a theme-token value holding a brace', () => {
  it('covers every value in every place, in every layer', () => {
    expect(cases).toHaveLength(VALUES.length * Object.keys(PLACES).length)
    expect(compiledClient).toHaveLength(COMPILED ? cases.length : 0)
  })

  it.each(cases.map((c, i) => [c.name, i] as const))('%s: names alike in every layer', (_, i) => {
    expect(client[i].name).toBeDefined()
    expect(server[i]).toBe(client[i].name)
    expect(themed[i].name).toBe(client[i].name)
    if (COMPILED) {
      expect(compiledClient[i].name).toBe(client[i].name)
      expect(compiledServer[i]).toBe(client[i].name)
    }
  })

  it.each(cases.map((c, i) => [c.name, i] as const))('%s: writes its tokens as variables and keeps the rest', (_, i) => {
    expectValueWritten(client[i].styles, cases[i].value)
    expectValueWritten(themed[i].styles, cases[i].value)
  })

  it.each(functionCases.map((c, i) => [c.name, i] as const))('%s: writes what the function returns the same way', (_, i) => {
    expectValueWritten(themedFunctions[i].styles, functionCases[i].value)
  })
})

describe('CSS text holding a token in a prelude or a selector', () => {
  it.each(Object.entries(CSS_TEXT).map(([name, c], i) => [name, c.resolved, i] as const))(
    '%s: takes the theme value, or is left out when the theme lacks it',
    (_, resolved, i) => {
      const { holding, lacking, none } = cssText[i]
      expect(holding.styles).toContain(resolved)
      expect(holding.styles).toContain('crimson')
      expect(lacking.styles).toBeDefined()
      expect(lacking.styles).not.toContain('crimson')
      for (const side of [holding, lacking, none]) expect(side.styles ?? '').not.toContain('theme.')
    },
  )
})
