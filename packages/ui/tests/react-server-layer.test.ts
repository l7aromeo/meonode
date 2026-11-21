// @vitest-environment node
//
// The runtime loaded as the React Server Components layer loads it: `react`
// resolved through its `react-server` export condition, and every `'use client'`
// module replaced by client references, as a bundler does there. That build of
// React omits `Component` and the client hooks, so any path that reads one breaks
// only here.
import { readFileSync, globSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isValidElement, type ReactElement } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const REACT_SERVER_ENTRY = path.join(path.dirname(require.resolve('react/package.json')), 'react.react-server.js')
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

/** Every module that opens with the `'use client'` directive, as `@src/…js` specifiers. */
const CLIENT_MODULES = globSync('**/*.ts', { cwd: SRC })
  .filter(file => readFileSync(path.join(SRC, file), 'utf8').startsWith("'use client'"))
  .map(file => `@src/${file.replace(/\.ts$/, '.js')}`)

/** Stands in for a bundler's client reference: renderable as an element type, never called on the server. */
const clientReference = (name: string) =>
  Object.assign(
    function ClientReference() {
      throw new Error(`client reference ${name} was called on the server`)
    },
    { $$typeof: Symbol.for('react.client.reference') },
  )

type Main = typeof import('@src/main.js')
type NodeUtilModule = typeof import('@src/util/node.util.js')
type DiagnosticsModule = typeof import('@src/util/theme-diagnostics.util.js')
let main: Main
let nodeUtil: NodeUtilModule['NodeUtil']
let diagnostics: DiagnosticsModule

beforeAll(async () => {
  // Export names come from the client graph, which loads these modules for real.
  const exportsOf = new Map<string, string[]>()
  for (const specifier of CLIENT_MODULES) exportsOf.set(specifier, Object.keys(await import(specifier)))

  vi.resetModules()
  // A CommonJS module's default import is its `module.exports`, as a bundler interops it.
  vi.doMock('react', () => {
    const reactServer = require(REACT_SERVER_ENTRY)
    return { ...reactServer, default: reactServer }
  })
  for (const [specifier, names] of exportsOf) {
    vi.doMock(specifier, () => Object.fromEntries(names.map(name => [name, clientReference(`${specifier}#${name}`)])))
  }
  main = await import('@src/main.js')
  nodeUtil = (await import('@src/util/node.util.js')).NodeUtil
  diagnostics = await import('@src/util/theme-diagnostics.util.js')
})

afterAll(() => {
  vi.doUnmock('react')
  for (const specifier of CLIENT_MODULES) vi.doUnmock(specifier)
  vi.resetModules()
})

describe('the runtime in the React Server Components layer', () => {
  it('loads against the react-server build, which has no Component', () => {
    expect('Component' in require(REACT_SERVER_ENTRY)).toBe(false)
    expect(CLIENT_MODULES.length).toBeGreaterThan(0)
  })

  it('hands a Promise child to React', () => {
    const child = Promise.resolve(1)
    const element = main.Div({ children: child }).render() as ReactElement<{ children: unknown }>
    expect(isValidElement(element)).toBe(true)
    expect(element.props.children).toBe(child)
  })

  it('hands a child it does not recognise to React', () => {
    const child = { unknown: true }
    const element = main.Div({ children: child as never }).render() as ReactElement<{ children: unknown }>
    expect(element.props.children).toBe(child)
  })

  // A provider may be above a server component; a function still cannot run there.
  it('says a dropped theme function cannot run in a server component, not that a provider is missing', () => {
    diagnostics.__resetThemeDiagnostics()
    const warnings: string[] = []
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => void warnings.push(String(args[0])))
    try {
      main.Div({ css: { color: theme => String(theme.mode) }, children: 'x' }).render()
    } finally {
      spy.mockRestore()
    }
    const dropped = warnings.filter(w => w.includes('theme function'))
    expect(dropped).toHaveLength(1)
    expect(dropped[0]).toContain('for `color`')
    expect(dropped[0]).toContain('server component')
    expect(dropped[0]).toContain('client component')
    expect(dropped[0]).not.toContain('no ThemeProvider')
  })

  // ThemeProvider is a client reference here, as a bundler makes it. Its factory
  // registers that very object, so the walk recognises it whatever the bundler
  // made of it, and a rule its direct child needs can render inside its context.
  it('renders the themed rule a direct child of ThemeProvider needs inside the provider', async () => {
    const { ThemedRule } = await import('@src/components/styled-renderer.client.js')
    const root = main
      .Div({
        children: main.ThemeProvider({
          tokens: { narrow: '1px' },
          modes: ['light'],
          defaultMode: 'light',
          children: main.Input({ css: { '@media (min-width: theme.narrow)': { color: 'green' } } }),
        }),
      })
      .render() as ReactElement<{ children: unknown }>
    const all = (node: unknown): ReactElement<{ children?: unknown }>[] =>
      Array.isArray(node)
        ? node.flatMap(all)
        : isValidElement(node)
          ? [node as ReactElement<{ children?: unknown }>, ...all((node as ReactElement<{ children?: unknown }>).props.children)]
          : []
    const provider = all(root).find(element => element.type === main.ThemeProvider.element)
    const inside = all(provider?.props.children)

    expect((main.ThemeProvider.element as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for('react.client.reference'))
    expect(inside.map(element => element.type)).toEqual(expect.arrayContaining(['input', ThemedRule]))
  })

  it('returns what a render-prop child returns', () => {
    const result = Promise.resolve(1)
    expect(nodeUtil.functionRenderer({ render: () => result } as never)).toBe(result)
  })

  it('passes each item of a render-prop child’s array through', () => {
    const result = Promise.resolve(1)
    expect(nodeUtil.functionRenderer({ render: () => [result] } as never)).toEqual([result])
  })

  // A function in a host element's props cannot be serialized to the client, so the
  // render prop must reach React already wrapped in a server-side renderer.
  it.each([
    ['unstyled', {}],
    ['styled', { padding: 8 }],
  ])('hands a render prop given as the only child of a %s host element to React as an element', (_, style) => {
    const element = main.Div({ ...style, children: () => 'from a render prop' }).render() as ReactElement<{ children: unknown }>
    // A styled host also carries its server-compiled rule among its children.
    const children = [element.props.children].flat(Infinity)
    expect(children.some(child => typeof child === 'function')).toBe(false)
    expect(children.some(child => isValidElement(child) && child.type === nodeUtil.functionRenderer)).toBe(true)
  })
})

describe('static css in the React Server Components layer', () => {
  const RED = 'mn-000000000000r'
  const MEDIA = 'mn-000000000000m'

  it('carries the static styles ahead of the runtime rules of the same host', async () => {
    const registry = await import('@src/util/static-css.util.js')
    const { StaticStyles } = await import('@src/components/static-styles.js')
    registry.__resetStaticCss()
    registry.registerStaticCss('rsc-page', [
      [0, RED, `.${RED}{color:red;}`],
      [2, MEDIA, `@media (min-width: 600px){.${MEDIA}{padding:9px;}}`],
    ])
    try {
      // The node with only runtime css comes first, so its rule reaches the host before any static class does.
      const root = main
        .Div({
          children: [
            main.Div({ key: 'runtime', css: { margin: 3 } }),
            main.Div({ __meo$: 2, __meo$s: RED, key: 'static' } as never),
            main.Div({ __meo$: 2, __meo$s: MEDIA, __meo$c: { padding: 4 }, key: 'partial' } as never),
          ],
        })
        .render() as ReactElement<{ children: unknown[] }>
      const children = root.props.children
      const slot = children[children.length - 1] as ReactElement<{ precedence?: string; classes?: string[] }>[]

      expect(slot.map(element => (element.type === StaticStyles ? 'static' : element.props.precedence))).toEqual(['static', 'meonode', 'meonode'])
      expect(slot[0].props.classes).toEqual([RED, MEDIA])

      // No `StaticInsertion` in this layer: its output is only ever hoisted.
      const [insertion, hoisted] = (
        StaticStyles(slot[0].props as never) as ReactElement<{ children: [unknown, ReactElement<{ href: string; precedence: string }>[]] }>
      ).props.children
      expect(insertion).toBeNull()
      expect(hoisted.map(element => [element.props.href, element.props.precedence])).toEqual([
        ['mn-static-0', 'mn-static-0'],
        ['mn-static-1', 'mn-static-1'],
        ['mn-static-2', 'mn-static-2'],
        ['mn-static-3', 'mn-static-3'],
        [`mn-static-${RED}`, 'mn-static-0'],
        [`mn-static-${MEDIA}`, 'mn-static-2'],
      ])

      const [, plain, partial] = children as ReactElement<{ className?: string }>[]
      expect(plain.type).toBe('div')
      expect(plain.props.className).toBe(RED)
      expect(partial.props.className).toMatch(new RegExp(`^${MEDIA} `))
    } finally {
      registry.__resetStaticCss()
    }
  })

  // A server component cannot tell whether a token is defined: the provider holds
  // the theme on the client. The variables its extracted styles read are handed to
  // `ThemeTokenCheck`, which renders where the element is, as for a server rule.
  it('hands the theme variables of extracted styles to a check where the providers are, in development', async () => {
    const registry = await import('@src/util/static-css.util.js')
    const { ThemeTokenCheck } = await import('@src/components/styled-renderer.client.js')
    const MISSING = 'mn-00000000000mt'
    registry.__resetStaticCss()
    registry.registerStaticCss('rsc-tokens', [[0, MISSING, `.${MISSING}{color:var(--meonode-theme-primary-missing);}`]])
    try {
      const root = main.Div({ children: [main.Div({ __meo$: 2, __meo$s: MISSING, key: 'static' } as never)] }).render() as ReactElement<{ children: unknown[] }>
      const slot = root.props.children[root.props.children.length - 1] as ReactElement<{ refs?: unknown }>[]
      const checks = slot.filter(element => element.type === ThemeTokenCheck)

      expect(checks.map(element => element.props.refs)).toEqual([[['--meonode-theme-primary-missing', 'color']]])
    } finally {
      registry.__resetStaticCss()
    }
  })

  // With a theme in the render itself, the server component can check the tokens there.
  it('checks the theme variables of extracted styles against a theme in scope, with no check carried', async () => {
    const registry = await import('@src/util/static-css.util.js')
    const { ThemeTokenCheck } = await import('@src/components/styled-renderer.client.js')
    const MISSING = 'mn-00000000000mt'
    registry.__resetStaticCss()
    diagnostics.__resetThemeDiagnostics()
    registry.registerStaticCss('rsc-scoped', [[0, MISSING, `.${MISSING}{color:var(--meonode-theme-primary-missing);}`]])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const root = main
        .Div({
          theme: { mode: 'light', system: { primary: { default: 'red' } } },
          children: [main.Div({ __meo$: 2, __meo$s: MISSING, key: 'static' } as never)],
        } as never)
        .render() as ReactElement<{ children: unknown[] }>
      const slot = root.props.children[root.props.children.length - 1] as ReactElement[]

      expect(slot.filter(element => element.type === ThemeTokenCheck)).toEqual([])
      expect(warn.mock.calls.map(([text]) => String(text)).filter(text => text.includes('--meonode-theme-primary-missing'))).toHaveLength(1)
    } finally {
      warn.mockRestore()
      registry.__resetStaticCss()
    }
  })

  // Debug mode in a production build: the server layer's output is not hydrated against anything, so it still carries the check.
  it('carries the check with debug mode on in a production build', async () => {
    const registry = await import('@src/util/static-css.util.js')
    const { ThemeTokenCheck } = await import('@src/components/styled-renderer.client.js')
    const MISSING = 'mn-00000000000mt'
    vi.stubEnv('NODE_ENV', 'production')
    diagnostics.__resetThemeDiagnostics()
    main.setDebugMode(true)
    registry.__resetStaticCss()
    registry.registerStaticCss('rsc-debug', [[0, MISSING, `.${MISSING}{color:var(--meonode-theme-primary-missing);}`]])
    try {
      const root = main.Div({ children: [main.Div({ __meo$: 2, __meo$s: MISSING, key: 'static' } as never)] }).render() as ReactElement<{ children: unknown[] }>
      const slot = root.props.children[root.props.children.length - 1] as ReactElement<{ refs?: unknown }>[]
      expect(slot.filter(element => element.type === ThemeTokenCheck).map(element => element.props.refs)).toEqual([
        [['--meonode-theme-primary-missing', 'color']],
      ])
    } finally {
      main.setDebugMode(false)
      vi.unstubAllEnvs()
      diagnostics.__resetThemeDiagnostics()
      registry.__resetStaticCss()
    }
  })

  // A page of an app that registered no static css, or only a module with no
  // rules, sends nothing for it: no `StaticStyles`, so no seed styles.
  it.each([
    ['nothing registered', () => {}],
    ['a module with no rules', (registry: typeof import('@src/util/static-css.util.js')) => registry.registerStaticCss('empty', [])],
  ])('adds nothing with %s', async (_, register) => {
    const registry = await import('@src/util/static-css.util.js')
    const { StaticStyles } = await import('@src/components/static-styles.js')
    registry.__resetStaticCss()
    register(registry)
    try {
      const root = main.Div({ children: [main.Div({ key: 'runtime', css: { margin: 3 } })] }).render() as ReactElement<{ children: unknown[] }>
      const slot = root.props.children[root.props.children.length - 1] as ReactElement<{ href?: string }>[]

      expect(slot.length).toBeGreaterThan(0)
      expect(slot.some(element => element.type === StaticStyles)).toBe(false)
      expect(slot.filter(element => String(element.props.href).startsWith(registry.STATIC_CSS_PREFIX))).toEqual([])
    } finally {
      registry.__resetStaticCss()
    }
  })
})
