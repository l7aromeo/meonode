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
  // The server build's own variant, which the unit suites' aliases swap for the default build's.
  vi.doMock('@src/components/static-styles.js', () => import(path.join(SRC, 'components/static-styles.ts')))
  vi.doMock('@src/util/emotion-cache.util.js', () => import(path.join(SRC, 'util/emotion-cache.util.ts')))
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

// A compiled node that carries its style's name, in a server component, against
// the same tree with its css on the runtime path: this layer compiles both to a
// class on the element and a rule React hoists, so the two trees must be equal.
describe('named static styles in the React Server Components layer', () => {
  type Css = Record<string, unknown>
  type Style = (css: Css, isStatic?: boolean) => Record<string, unknown>
  const RED = { color: 'rgb(200, 0, 0)' }
  const BLUE = { color: 'rgb(0, 0, 200)' }

  /** An element tree as plain data, server components rendered: types by name, every prop but children, then the children. */
  function shape(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(shape)
    if (!isValidElement(value)) return typeof value === 'function' ? `fn:${value.name}` : value
    const { children, ...props } = value.props as Record<string, unknown>
    const type = value.type as unknown
    // A server component renders here, as the server renders it; a client reference does not.
    if (typeof type === 'function' && !('$$typeof' in type)) return shape((type as (props: unknown) => unknown)(value.props))
    const name = typeof type === 'string' ? type : typeof type === 'function' ? type.name : String(type)
    return { type: name, key: value.key, props: Object.fromEntries(Object.entries(props).map(([key, prop]) => [key, shape(prop)])), children: shape(children) }
  }

  async function styles() {
    const registry = await import('@src/util/static-css.util.js')
    const { ThemeUtil } = await import('@src/util/theme.util.js')
    const { nameStyles } = await import('@src/util/style-name.util.js')
    const { serializeStyles } = await import('@emotion/serialize')
    const runtime: Style = css => ({ css })
    const compiled: Style = (css, isStatic = true) => {
      if (!isStatic) return { css }
      const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
      const { name, styles: text } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
      registry.registerStaticCss(`m-${name}`, [[name, text]])
      return { __meo$: 2, __meo$n: name }
    }
    /** As the compiler emits a node of `css` whose `hole` key holds a run-time value: a template and the value's text. */
    const templated = (css: Css, hole: string): Record<string, unknown> => {
      const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
      const text = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never)).styles
      const value = main.toCssValue(hole, css[hole])!
      const at = text.indexOf(value)
      registry.registerStaticTemplate(`t-${hole}`, [text.slice(0, at), text.slice(at + value.length)])
      return { __meo$: 2, __meo$t: [`t-${hole}`, value] }
    }
    return { registry, runtime, compiled, templated }
  }

  it('compiles a node filled from a template as its css', async () => {
    const { registry, runtime, templated } = await styles()
    registry.__resetStaticCss()
    try {
      const tree = (style: (css: Css) => Record<string, unknown>) =>
        main.Div({ children: [main.Div({ key: 1, ...style({ width: '37%' }) }), main.Div({ key: 2, ...style({ width: '37%' }) })] })
      const expected = shape(tree(runtime).render())
      expect(JSON.stringify(expected)).toContain('"precedence":"meonode"')
      expect(shape(tree(css => templated(css, 'width')).render())).toEqual(expected)
    } finally {
      registry.__resetStaticCss()
    }
  })

  const CASES: Record<string, (style: Style) => import('@src/main.js').NodeInstance> = {
    'a parent’s & > * against its static child’s colour': style => main.Div({ ...style({ '& > *': RED }), children: main.Span('c', style(BLUE)) }),
    'statics and runtimes interleaved among siblings': style =>
      main.Div({
        children: [
          main.Div({ key: 1, ...style({ order: 1 }) }),
          main.Div({ key: 2, ...style({ order: 2 }, false) }),
          main.Div({ key: 3, ...style({ order: 3 }), children: main.Div(style({ order: 4 })) }),
        ],
      }),
    'two nodes of one style': style => main.Div({ children: [main.Div({ key: 1, ...style(BLUE) }), main.Div({ key: 2, ...style(BLUE) })] }),
    'a server component handed a class it puts on a static node': style => {
      const Box = (props: { className?: string }) => main.Div({ className: props.className, ...style(BLUE) }).render() as ReactElement
      return main.Div({ children: main.Node(Box, { ...style(RED, false), className: 'given' }) })
    },
  }

  // A client reference renders in the browser, through `StyledRenderer` as its
  // css would, so the compiled style goes with it.
  it('hands a client reference’s StyledRenderer the compiled style in place of css', async () => {
    const { registry, compiled } = await styles()
    registry.__resetStaticCss()
    try {
      const Link = clientReference('next/link#default')
      const props = compiled(BLUE)
      const element = main.Node(Link, { href: '/a', ...props } as never).render() as ReactElement<Record<string, unknown>>
      const name = props.__meo$n as string
      expect(element.props).toMatchObject({ element: Link, href: '/a', __meonodeStaticStyle: { name, styles: registry.staticStylesOf(name) } })
      expect(element.props.css).toBeUndefined()
    } finally {
      registry.__resetStaticCss()
    }
  })

  // A call of an imported factory the compiler joins (`__meoFactoryCall`)
  // renders a named node, here as a template's or a named node's does.
  it('renders a joined call of an imported factory as the call uncompiled', async () => {
    const { registry } = await styles()
    registry.__resetStaticCss()
    try {
      type Make = (props: Record<string, unknown>) => import('@src/main.js').NodeInstance
      const Panel = main.createNode('section', { padding: 8, css: { color: 'rgb(200, 0, 0)' } } as never) as unknown as Make
      const site = { at: 0 }
      const joined: Make = props => main.__meoFactoryCall(Panel, site, props) as ReturnType<Make>
      expect((joined({ padding: 4 }).props as Record<string, unknown>).__meo$n).toBeDefined()
      const tree = (make: Make) => main.Div({ children: [make({ key: 'a', padding: 4, children: 'x' }), make({ key: 'b', padding: 4 })] })
      const expected = shape(tree(Panel).render())
      expect(JSON.stringify(expected)).toContain('"precedence":"meonode"')
      expect(shape(tree(joined).render())).toEqual(expected)

      // Over a client reference, the joined style goes with the element.
      const Link = clientReference('next/link#default')
      const Linked = main.createNode(Link as never, { padding: 8 } as never) as unknown as Make
      const element = (main.__meoFactoryCall(Linked, { at: 0 }, { href: '/a', padding: 4 }) as ReturnType<Make>).render() as ReactElement<
        Record<string, unknown>
      >
      const style = element.props.__meonodeStaticStyle as { name: string; styles: string }
      expect(style.styles).toBe(registry.staticStylesOf(style.name))
      expect(style.styles).toContain('padding:4px;')
      expect(element.props.css).toBeUndefined()
    } finally {
      registry.__resetStaticCss()
    }
  })

  // With no theme in scope here, the theme variables go to a check where the
  // providers are, as a server rule's do; diagnostics are on in a test run.
  it('hands the theme variables of a named node to a check, as its css’s', async () => {
    const { registry, runtime, compiled } = await styles()
    const { replaceThemeTokensWithCssVars } = await import('@src/util/server-theme.util.js')
    registry.__resetStaticCss()
    try {
      const css = { color: 'theme.primary.missing' }
      const tree = (style: Style) => main.Div({ children: main.Div(style(replaceThemeTokensWithCssVars(css))) })
      const checks = (value: unknown): unknown[] =>
        JSON.stringify(shape(value))
          .match(/"type":"ClientReference","key":"[^"]*:check","props":\{"refs":(\[[^\]]*\])/g)
          ?.map(found => found.slice(found.indexOf('"refs":') + 7)) ?? []
      const expected = checks(tree(runtime).render())
      expect(expected.length).toBe(1)
      expect(checks(tree(compiled).render())).toEqual(expected)
    } finally {
      registry.__resetStaticCss()
    }
  })

  // With a theme in the render itself, the server component checks the tokens
  // there, and carries no check, as for the css uncompiled.
  it('checks the theme variables of a named node against a theme in scope, as its css’s', async () => {
    const { registry, runtime, compiled } = await styles()
    const { replaceThemeTokensWithCssVars } = await import('@src/util/server-theme.util.js')
    const { ThemeTokenCheck } = await import('@src/components/styled-renderer.client.js')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registry.__resetStaticCss()
    try {
      const css = { color: 'theme.primary.missing' }
      const tree = (style: Style) =>
        main.Div({
          theme: { mode: 'light', system: { primary: { default: 'red' } } },
          children: [main.Div({ key: 'n', ...style(replaceThemeTokensWithCssVars(css)) })],
        } as never)
      const run = (style: Style) => {
        diagnostics.__resetThemeDiagnostics()
        warn.mockClear()
        const slot = [(tree(style).render() as ReactElement<{ children: unknown }>).props.children].flat(Infinity) as ReactElement[]
        return {
          checks: slot.filter(element => element.type === ThemeTokenCheck).length,
          warnings: warn.mock.calls.map(([text]) => String(text)).filter(text => text.includes('--meonode-theme-primary-missing')),
        }
      }
      const expected = run(runtime)
      expect(expected).toMatchObject({ checks: 0, warnings: [expect.any(String)] })
      expect(run(compiled)).toEqual(expected)
    } finally {
      warn.mockRestore()
      registry.__resetStaticCss()
    }
  })

  // Debug mode in a production build: the server layer's output is not hydrated
  // against anything, so it still carries the check, as for the css uncompiled.
  it('carries a named node’s check with debug mode on in a production build, as its css’s', async () => {
    const { registry, runtime, compiled } = await styles()
    const { replaceThemeTokensWithCssVars } = await import('@src/util/server-theme.util.js')
    const { ThemeTokenCheck } = await import('@src/components/styled-renderer.client.js')
    vi.stubEnv('NODE_ENV', 'production')
    diagnostics.__resetThemeDiagnostics()
    main.setDebugMode(true)
    registry.__resetStaticCss()
    try {
      const css = { color: 'theme.primary.missing' }
      const refsOf = (style: Style) =>
        (
          [
            (main.Div({ children: [main.Div({ key: 'n', ...style(replaceThemeTokensWithCssVars(css)) })] }).render() as ReactElement<{ children: unknown }>)
              .props.children,
          ].flat(Infinity) as ReactElement<{ refs?: unknown }>[]
        )
          .filter(element => element.type === ThemeTokenCheck)
          .map(element => element.props.refs)
      const expected = refsOf(runtime)
      expect(expected).toEqual([[['--meonode-theme-primary-missing', 'color']]])
      expect(refsOf(compiled)).toEqual(expected)
    } finally {
      main.setDebugMode(false)
      vi.unstubAllEnvs()
      diagnostics.__resetThemeDiagnostics()
      registry.__resetStaticCss()
    }
  })

  it.each(Object.entries(CASES))('%s', async (_, tree) => {
    const { registry, runtime, compiled } = await styles()
    registry.__resetStaticCss()
    try {
      const expected = shape(tree(runtime).render())
      expect(JSON.stringify(expected)).toContain('"precedence":"meonode"')
      expect(shape(tree(compiled).render())).toEqual(expected)
    } finally {
      registry.__resetStaticCss()
    }
  })
})
