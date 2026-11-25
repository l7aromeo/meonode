// @vitest-environment jsdom
//
// The development warning for a theme token the active theme does not define,
// for styles the compiler named. Uncompiled, `StyledRenderer` reports such a
// token where it renders. Named, the token is in the style's registered text or
// in a template's value, and the element renders plain, so the walk checks it:
// in render within its own theme scope, and on the element after commit under a
// component that may provide another theme. Each case compares the warnings with
// those of the same call site uncompiled: the same text, once each.
import { serializeStyles } from '@emotion/serialize'
import { act, createElement, type ReactElement, use } from 'react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Div, Img, Node, PortalProvider, setDebugMode, Span, ThemeProvider, type NodeInstance } from '@src/main.js'
import { ThemeTokenCheck } from '@src/components/styled-renderer.client.js'
import { checkCandidates, nearestThemeContext } from '@src/util/static-theme-check.util.js'
import { ThemeContext } from '@src/components/theme-provider.client.js'
import { NodeUtil } from '@src/util/node.util.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import {
  __checkedThemeVars,
  __resetThemeDiagnostics,
  definedVarsOf,
  getTokensVarIndex,
  type ThemeVarIndex,
  type ThemeVarRef,
} from '@src/util/theme-diagnostics.util.js'
import { asThemeProps } from '../_theme-props.js'
import { templated } from './_template.js'
import { checksSettled } from './_checks-settled.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const theme = {
  mode: 'light',
  system: {
    primary: { default: 'rgb(0, 0, 255)' },
    surface: 'rgb(255, 255, 255)',
  },
} as const

/** A theme for a provider nested inside the walk, defining one more token. */
const inner = { mode: 'light', system: { accent: 'rgb(0, 128, 0)' } } as const

type Css = Record<string, unknown>

/** Props for a node of `css` as the compiler emits it: its tokens as variables, its style named and registered. */
function named(css: Css): Record<string, unknown> {
  const resolved = ThemeUtil.resolveObjWithTheme(replaceThemeTokensWithCssVars(css), undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const { name, styles } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  registerStaticCss(`m-${name}`, [[name, styles]])
  return { __meo$: 2, __meo$n: name }
}

const MISSING_COLOR: Css = { color: 'theme.primary.missing' }
const DEFINED_COLOR: Css = { color: 'theme.primary' }
const MISSING_BG: Css = { backgroundColor: 'theme.surface.missing' }
const DEFINED_BG: Css = { backgroundColor: 'theme.surface' }
const ACCENT: Css = { color: 'theme.accent' }

beforeEach(() => {
  __resetStaticCss()
  __resetThemeDiagnostics()
})

/** Renders `make`'s element from a component, where an app's walk runs and reads its contexts. */
const inRender = (make: () => ReactElement): ReactElement =>
  createElement(function Page() {
    return make()
  })

let warnings: string[] = []
let originalWarn: typeof console.warn
let roots: Root[] = []

beforeEach(() => {
  warnings = []
  originalWarn = console.warn
  console.warn = (...args: unknown[]) => void warnings.push(String(args[0]))
})
afterEach(() => {
  console.warn = originalWarn
  for (const root of roots) act(() => root.unmount())
  roots = []
  document.body.innerHTML = ''
})

function mount(element: () => ReactElement) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(inRender(element)))
}

/**
 * The token warnings rendering `node` gives, and the variables it checked, from
 * a fresh record, once the checks after commit have run.
 */
async function tokenChecks(node: () => NodeInstance, withProvider = true): Promise<{ warnings: string[]; checked: string[] }> {
  __resetThemeDiagnostics()
  warnings = []
  mount(() => (withProvider ? ThemeProvider({ ...asThemeProps(theme as never), children: node() }) : node()).render() as ReactElement)
  await checksSettled()
  return { warnings: warnings.filter(text => text.includes('--meonode-theme-')), checked: [...__checkedThemeVars()].sort() }
}

/** The token warnings rendering `node` gives, from a fresh record of what was reported. */
const tokenWarnings = async (node: () => NodeInstance, withProvider = true): Promise<string[]> => (await tokenChecks(node, withProvider)).warnings

/** Asserts the compiled call site warns exactly as the same call site uncompiled, and that it warns at all. */
async function warnsAsUncompiled(uncompiled: () => NodeInstance, compiled: () => NodeInstance, withProvider = true) {
  const expected = await tokenWarnings(uncompiled, withProvider)
  expect(expected.length).toBeGreaterThan(0)
  expect(await tokenWarnings(compiled, withProvider)).toEqual(expected)
}

/**
 * Asserts neither form warns, and that the compiled form checked the variables
 * the uncompiled one did: no warning from a check that never ran.
 */
async function quietAsUncompiled(uncompiled: () => NodeInstance, compiled: () => NodeInstance, withProvider = true) {
  const expected = await tokenChecks(uncompiled, withProvider)
  expect(expected.warnings).toEqual([])
  expect(expected.checked.length).toBeGreaterThan(0)
  expect(await tokenChecks(compiled, withProvider)).toEqual(expected)
}

/** A component that renders its children as given. */
const Wrapper = ({ children }: { children?: unknown }) => children as ReactElement

/**
 * `node` after a runtime sibling, whose rule its named style follows, so it
 * renders as a plain element and the walk checks its tokens. With no rule
 * before it, it would render through `StyledRenderer` as a carrier, which
 * checks its own.
 */
const afterRule = (node: NodeInstance) => Div({ children: [Div({ key: 'rule', css: { order: 0 } }), node] })

const compiled = (css: Css, rest: Record<string, unknown> = {}) => afterRule(Div({ key: 'named', ...named(css), ...rest } as never))

describe('a token the active theme does not define, named', () => {
  it('warns from a declaration', async () => {
    await warnsAsUncompiled(
      () => Div({ color: 'theme.primary.missing' }),
      () => compiled(MISSING_COLOR),
    )
  })

  it('warns from the branch a switch picked', async () => {
    const open = true
    await warnsAsUncompiled(
      () => Div({ backgroundColor: open ? 'theme.surface.missing' : 'theme.surface' }),
      () => compiled(open ? MISSING_BG : DEFINED_BG),
    )
  })

  // The branch not taken holds an undefined token too, but nothing renders it.
  it('stays quiet for the branch a switch did not pick', async () => {
    const open = false
    await quietAsUncompiled(
      () => Div({ backgroundColor: open ? 'theme.surface.missing' : 'theme.surface' }),
      () => compiled(open ? MISSING_BG : DEFINED_BG),
    )
  })

  it('warns from a variable’s value', async () => {
    const value = 'calc(4px + theme.spacing.missing)'
    await warnsAsUncompiled(
      () => Div({ width: value }),
      () => Div(templated({ width: value }, ['width']) as never),
    )
  })

  it('warns from a pseudo-class rule', async () => {
    await warnsAsUncompiled(
      () => Div({ css: { '&:hover': { color: 'theme.hover.missing' } } }),
      () => compiled({ '&:hover': { color: 'theme.hover.missing' } }),
    )
  })

  it('warns from a per-node selector rule', async () => {
    await warnsAsUncompiled(
      () => Div({ css: { '& pre:not(.a)': { borderColor: 'theme.border.missing' } } }),
      () => compiled({ '& pre:not(.a)': { borderColor: 'theme.border.missing' } }),
    )
  })

  it('warns once for a declaration the prefixer copies', async () => {
    await warnsAsUncompiled(
      () => Div({ userSelect: 'theme.select.missing' }),
      () => compiled({ userSelect: 'theme.select.missing' }),
    )
  })

  it('warns with no ThemeProvider above', async () => {
    await warnsAsUncompiled(
      () => Div({ color: 'theme.primary.missing' }),
      () => compiled(MISSING_COLOR),
      false,
    )
  })

  it('warns for a node deep in the walk, under a component', async () => {
    await warnsAsUncompiled(
      () => Div({ children: Node(Wrapper, { children: Span('y', { color: 'theme.primary.missing' }) }) }),
      () => Div({ children: Node(Wrapper, { children: afterRule(Span('y', { key: 'named', ...named(MISSING_COLOR) } as never)) }) }),
    )
  })
})

describe('a node under a component inside the walk, which may provide another theme', () => {
  /** A component that renders its children inside a provider of its own, out of the walk's sight. */
  const InnerTheme = ({ children }: { children?: NodeInstance }) => ThemeProvider({ ...asThemeProps(inner as never), children }).render() as ReactElement

  it('stays quiet when a provider inside the component defines the token', async () => {
    await quietAsUncompiled(
      () => Div({ children: Node(InnerTheme, { children: Span('y', { color: 'theme.accent' }) }) }),
      () => Div({ children: Node(InnerTheme, { children: afterRule(Span('y', { key: 'named', ...named(ACCENT) } as never)) }) }),
    )
  })

  it('warns when no provider above it defines the token', async () => {
    await warnsAsUncompiled(
      () => Div({ children: Node(InnerTheme, { children: Span('y', { color: 'theme.primary.missing' }) }) }),
      () => Div({ children: Node(InnerTheme, { children: afterRule(Span('y', { key: 'named', ...named(MISSING_COLOR) } as never)) }) }),
    )
  })

  // The variables are declared on `:root`, so the page resolves a token a sibling
  // provider defines; the runtime checks the providers above the element, and so does this.
  it('warns for a token only a sibling provider defines, as the runtime does', async () => {
    const page = (child: NodeInstance) =>
      Div({
        children: [
          ThemeProvider({ ...asThemeProps(inner as never), key: 'sibling', children: Div({ children: 's' }) }),
          Node(Wrapper, { key: 'w', children: child }),
        ],
      })
    await warnsAsUncompiled(
      () => page(Span('y', { color: 'theme.accent' })),
      () => page(afterRule(Span('y', { key: 'named', ...named(ACCENT) } as never))),
    )
  })

  it('warns for a void element', async () => {
    await warnsAsUncompiled(
      () => Div({ children: Node(Wrapper, { children: Img({ color: 'theme.primary.missing' }) }) }),
      () => Div({ children: Node(Wrapper, { children: afterRule(Img({ key: 'named', ...named(MISSING_COLOR) } as never)) }) }),
    )
  })

  it('warns from a template’s value', async () => {
    const value = 'calc(4px + theme.spacing.missing)'
    await warnsAsUncompiled(
      () => Div({ children: Node(Wrapper, { children: Div({ width: value }) }) }),
      () => Div({ children: Node(Wrapper, { children: Div(templated({ width: value }, ['width']) as never) }) }),
    )
  })

  // Another element of the same template, outside that provider, is a style of its own.
  it('checks a template’s value on the element it fills, not on another of the same template', async () => {
    await quietAsUncompiled(
      () => Div({ children: [Div({ key: 'a', width: 4 }), Node(InnerTheme, { key: 'b', children: Div({ width: 'theme.accent' }) })] }),
      () =>
        Div({
          children: [
            Div({ key: 'a', ...templated({ width: 4 }, ['width']) } as never),
            Node(InnerTheme, { key: 'b', children: Div(templated({ width: 'theme.accent' }, ['width']) as never) }),
          ],
        }),
    )
  })

  // An element of another style reads only its own text.
  it('checks an element only for a candidate whose class it has', async () => {
    await quietAsUncompiled(
      () =>
        Div({
          children: [
            Div({ key: 'a', color: 'theme.primary' }),
            Node(InnerTheme, { key: 'b', children: Div({ color: 'theme.primary', backgroundColor: 'theme.accent' }) }),
          ],
        }),
      () =>
        Div({
          children: [
            compiled(DEFINED_COLOR, { key: 'a' }),
            Node(InnerTheme, { key: 'b', children: compiled({ color: 'theme.primary', backgroundColor: 'theme.accent' }) }),
          ],
        }),
    )
  })

  // The accepted cost of a check that adds nothing to the render: the server
  // cannot see the providers a component may put between the walk and the node,
  // so the node is checked in the browser, after commit, where uncompiled it is
  // checked on both sides.
  it('does not warn during a server render, where uncompiled warns', () => {
    const page = (child: NodeInstance) => ThemeProvider({ ...asThemeProps(theme as never), children: Div({ children: Node(Wrapper, { children: child }) }) })
    expect(serverTokenWarnings(page(Div(MISSING_COLOR)))).toHaveLength(1)
    expect(serverTokenWarnings(page(compiled(MISSING_COLOR)))).toEqual([])
  })
})

describe('a token the active theme defines, named', () => {
  it('stays quiet', async () => {
    await quietAsUncompiled(
      () => Div({ color: 'theme.primary', backgroundColor: 'theme.surface' }),
      () => compiled({ ...DEFINED_COLOR, ...DEFINED_BG }),
    )
  })

  it('stays quiet for a token only a provider inside the walk defines', async () => {
    await quietAsUncompiled(
      () => Div({ children: ThemeProvider({ ...asThemeProps(inner as never), children: Span('y', { color: 'theme.accent' }) }) }),
      () => Div({ children: ThemeProvider({ ...asThemeProps(inner as never), children: afterRule(Span('y', { key: 'named', ...named(ACCENT) } as never)) }) }),
    )
  })
})

describe('a provider inside the walk, below its topmost host', () => {
  // A root layout written with MeoNode: hosts above the provider in the same walk.
  const layout = (child: NodeInstance) => Div({ children: Div({ children: ThemeProvider({ ...asThemeProps(theme as never), children: child }) }) })

  it('checks a node below it against it, not against what is above the walk', async () => {
    await quietAsUncompiledNoOuter(
      () => layout(Span('y', { color: 'theme.primary' })),
      () => layout(afterRule(Span('y', { key: 'named', ...named(DEFINED_COLOR) } as never))),
    )
    await warnsAsUncompiled(
      () => layout(Span('y', { color: 'theme.primary.missing' })),
      () => layout(afterRule(Span('y', { key: 'named', ...named(MISSING_COLOR) } as never))),
      false,
    )
  })

  it('does so during a server render too', () => {
    const serverWarnings = (node: NodeInstance) => {
      __resetThemeDiagnostics()
      warnings = []
      NodeUtil.isServer = true
      try {
        renderToString(inRender(() => node.render() as ReactElement))
      } finally {
        NodeUtil.isServer = false
      }
      return warnings.filter(text => text.includes('--meonode-theme-'))
    }
    expect(serverWarnings(layout(afterRule(Span('y', { key: 'named', ...named(DEFINED_COLOR) } as never))))).toEqual([])
    expect(serverWarnings(layout(afterRule(Span('y', { key: 'named', ...named(MISSING_COLOR) } as never))))).toEqual(
      serverWarnings(layout(Span('y', { color: 'theme.primary.missing' }))),
    )
    expect(serverWarnings(layout(Span('y', { color: 'theme.primary.missing' })))).toHaveLength(1)
  })
})

/** Asserts as {@link quietAsUncompiled} does, with no provider above the walk. */
const quietAsUncompiledNoOuter = (uncompiled: () => NodeInstance, compiled: () => NodeInstance) => quietAsUncompiled(uncompiled, compiled, false)

/** Every fiber below `container`'s root, as React holds them. */
interface Fiber {
  type: unknown
  child: Fiber | null
  sibling: Fiber | null
}

function fibersOf(container: Element): Fiber[] {
  const key = Object.keys(container).find(name => name.startsWith('__reactContainer$'))!
  const out: Fiber[] = []
  const stack: Fiber[] = [(container as unknown as Record<string, Fiber>)[key]]
  while (stack.length > 0) {
    const fiber = stack.pop()!
    out.push(fiber)
    if (fiber.sibling) stack.push(fiber.sibling)
    if (fiber.child) stack.push(fiber.child)
  }
  return out
}

/** A fiber's type, as a name a test can compare. */
const typeName = (type: unknown): string =>
  typeof type === 'string' ? type : typeof type === 'function' ? type.name : typeof type === 'symbol' ? String(type) : type === null ? 'root' : 'object'

describe('in production', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    __resetThemeDiagnostics()
  })

  /** A node in the walk's theme scope and one under a component, of `css` named or on the runtime path. */
  const treeOf = (style: (css: Css, rest?: Record<string, unknown>) => NodeInstance) => () =>
    ThemeProvider({
      ...asThemeProps(theme as never),
      children: Div({ children: [style(MISSING_COLOR, { key: 'a' }), Node(Wrapper, { key: 'b', children: style(MISSING_BG) })] }),
    })
  const tree = treeOf(compiled)
  const uncompiledTree = treeOf((css, rest) => Div({ ...css, ...rest }))

  /** The page's markup, its fibers, and the token warnings, for one mode, after the checks after commit. */
  async function renderIn(mode: 'development' | 'production', page = tree) {
    vi.stubEnv('NODE_ENV', mode)
    __resetThemeDiagnostics()
    warnings = []
    NodeUtil.isServer = true
    let html: string
    try {
      html = renderToString(inRender(() => page().render() as ReactElement))
    } finally {
      NodeUtil.isServer = false
    }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => root.render(inRender(() => page().render() as ReactElement)))
    await checksSettled()
    return {
      html,
      warnings: warnings.filter(text => text.includes('--meonode-theme-')),
      fibers: fibersOf(container).map(fiber => typeName(fiber.type)),
    }
  }

  it('checks nothing for named styles, with the same markup and fibers', async () => {
    const development = await renderIn('development')
    const production = await renderIn('production')

    // The development run shows what the production run is held to: both nodes reported.
    expect(development.warnings).toHaveLength(2)

    expect(production.warnings).toEqual([])
    expect(production.html).toBe(development.html)
    expect(production.fibers).toEqual(development.fibers)
    expect(production.fibers).not.toContain(ThemeTokenCheck.name)
  })

  // `setDebugMode` can be on in a production build; it checks what it can while
  // rendering. A production build has no check after commit, so a node under a
  // component, which uncompiled is checked where it renders, is not.
  it('with debug mode on, checks a node in the walk’s theme scope, not one under a component', async () => {
    setDebugMode(true)
    try {
      expect((await renderIn('production', uncompiledTree)).warnings).toHaveLength(2)
      const { warnings: reported } = await renderIn('production')
      expect(reported).toHaveLength(1)
      expect(reported[0]).toContain('--meonode-theme-primary-missing')
    } finally {
      setDebugMode(false)
    }
  })
})

/** The token warnings a server render of `node` gives. */
function serverTokenWarnings(node: NodeInstance): string[] {
  __resetThemeDiagnostics()
  warnings = []
  NodeUtil.isServer = true
  try {
    renderToString(inRender(() => node.render() as ReactElement))
  } finally {
    NodeUtil.isServer = false
  }
  return warnings.filter(text => text.includes('--meonode-theme-'))
}

describe('a server render in development', () => {
  // MeoNode's own providers render their children as given, so they do not hide a node from the server's check.
  it('warns for a node under one of MeoNode’s own pass-through providers', () => {
    expect(
      serverTokenWarnings(
        ThemeProvider({ ...asThemeProps(theme as never), children: Div({ children: PortalProvider({ children: compiled(MISSING_COLOR) }) }) }),
      ),
    ).toHaveLength(1)
  })

  // The component is above the walk, which renders inside it, in the node's scope.
  it('warns for a node under a component above the walk', () => {
    expect(
      serverTokenWarnings(
        ThemeProvider({
          ...asThemeProps(theme as never),
          children: Node(() => Div({ children: compiled(MISSING_COLOR) }).render() as ReactElement),
        }),
      ),
    ).toHaveLength(1)
  })

  it('warns for a node in the walk’s theme scope, with the runtime’s text', () => {
    const reported = serverTokenWarnings(ThemeProvider({ ...asThemeProps(theme as never), children: compiled(MISSING_COLOR) }))
    expect(reported).toHaveLength(1)
    expect(reported[0]).toContain('is not defined by the active theme')
  })
})

describe('reading the nearest provider through React’s fiber', () => {
  function rendered(): Element {
    mount(
      () =>
        ThemeProvider({
          ...asThemeProps(theme as never),
          children: Div({ children: Node(Wrapper, { children: compiled(DEFINED_COLOR, { id: 'read' }) }) }),
        }).render() as ReactElement,
    )
    return document.getElementById('read')!
  }
  const fiberKey = (element: Element) => Object.keys(element).find(name => name.startsWith('__reactFiber$'))!

  it('finds the provider above the element', () => {
    expect(definedVarsOf(nearestThemeContext(rendered(), ThemeContext)!).has('--meonode-theme-primary')).toBe(true)
  })

  it('finds none above an element with no provider', () => {
    mount(() => Div({ children: compiled(DEFINED_COLOR, { id: 'bare' }) }).render() as ReactElement)
    expect(nearestThemeContext(document.getElementById('bare')!, ThemeContext)).toBeNull()
  })

  it('cannot tell without the fiber key', () => {
    const element = rendered()
    delete (element as unknown as Record<string, unknown>)[fiberKey(element)]
    expect(nearestThemeContext(element, ThemeContext)).toBeUndefined()
  })

  it.each([
    ['return', { type: 'span' }],
    ['type', { return: null }],
  ])('cannot tell when a fiber lacks `%s`', (_, fiber) => {
    const element = rendered()
    ;(element as unknown as Record<string, unknown>)[fiberKey(element)] = fiber
    expect(nearestThemeContext(element, ThemeContext)).toBeUndefined()
  })
})

describe('an element whose fiber cannot be read', () => {
  /** Renders a candidate, takes the fiber key off its element, and checks it again. */
  // Rendered with a defined token, so nothing is reported before the check under test.
  async function checkWithoutFiber(refs: ThemeVarRef[]) {
    mount(
      () =>
        ThemeProvider({
          ...asThemeProps(theme as never),
          children: Div({ children: Node(Wrapper, { children: compiled(DEFINED_COLOR, { id: 'unread' }) }) }),
        }).render() as ReactElement,
    )
    await checksSettled()
    const element = document.getElementById('unread')!
    const classes = element.className
    delete (element as unknown as Record<string, unknown>)[Object.keys(element).find(name => name.startsWith('__reactFiber$'))!]
    // The record of mounted providers is kept: it is what the element is checked against.
    warnings = []
    checkCandidates([{ classes, refs }], ThemeContext)
    const before = [...warnings]
    await Promise.resolve()
    return { before, after: warnings.filter(text => text.includes('--meonode-theme-')) }
  }

  it('is checked against every mounted provider, once their effects have run', async () => {
    const { before, after } = await checkWithoutFiber([['--meonode-theme-primary', 'color']])
    expect(before).toEqual([])
    expect(after).toEqual([])
  })

  it('is reported when no mounted provider defines the token', async () => {
    const { before, after } = await checkWithoutFiber([['--meonode-theme-primary-missing', 'color']])
    expect(before).toEqual([])
    expect(after).toHaveLength(1)
    expect(after[0]).toContain('is not defined by the active theme')
  })
})

describe('a node in a portal under a component', () => {
  const InPortal = ({ children }: { children?: ReactElement }) => createPortal(children, document.body)

  it('is checked against the providers above it in the tree, not in the document', async () => {
    const InnerTheme = ({ children }: { children?: NodeInstance }) => ThemeProvider({ ...asThemeProps(inner as never), children }).render() as ReactElement
    await quietAsUncompiled(
      () => Div({ children: Node(InnerTheme, { children: Node(InPortal, { children: Span('y', { color: 'theme.accent' }) }) }) }),
      () => Div({ children: Node(InnerTheme, { children: Node(InPortal, { children: afterRule(Span('y', { key: 'named', ...named(ACCENT) } as never)) }) }) }),
    )
    await warnsAsUncompiled(
      () => Div({ children: Node(InPortal, { children: Span('y', { color: 'theme.accent' }) }) }),
      () => Div({ children: Node(InPortal, { children: afterRule(Span('y', { key: 'named', ...named(ACCENT) } as never)) }) }),
    )
  })
})

describe('a node directly under a component at the top of the walk', () => {
  // No host of the walk is above it, so the node is checked after commit.
  it('is checked against a provider inside the component', async () => {
    const InnerTheme = ({ children }: { children?: NodeInstance }) => ThemeProvider({ ...asThemeProps(inner as never), children }).render() as ReactElement
    await quietAsUncompiled(
      () => Node(InnerTheme, { children: Img({ color: 'theme.accent' }) }),
      () => Node(InnerTheme, { children: Img(named(ACCENT) as never) }),
    )
  })
})

describe('a ThemeProvider’s tokens, read from its node', () => {
  it('give the variables the provider itself defines', () => {
    const tokens = { primary: { default: 'red', content: 'white' }, spacing: { md: 16 }, flag: true, none: null, brand: { light: '#a', dark: '#b' } }
    let defined: ThemeVarIndex | undefined
    const Read = () => {
      defined = definedVarsOf(use(ThemeContext)!)
      return null
    }
    mount(() => ThemeProvider({ tokens, modes: ['light'], defaultMode: 'light', children: Node(Read) } as never).render() as ReactElement)

    expect([...getTokensVarIndex(tokens)]).toEqual([...defined!])
    expect(defined!.size).toBeGreaterThan(3)
  })
})
