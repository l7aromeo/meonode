// @vitest-environment jsdom
//
// The development warning for a theme token the active theme does not define,
// for styles the compiler extracted. Uncompiled, `StyledRenderer` reports such a
// token where it renders. Extracted, the token is in a static rule or in a
// variable's value, and the element renders plain, so the walk's `StaticStyles`
// checks it instead. Each case compares the warnings with those of the same call
// site uncompiled: the same text, once each.
import { act, type ReactElement, use } from 'react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Div, Img, Node, PortalProvider, setDebugMode, Span, ThemeProvider, toCssValue, type NodeInstance } from '@src/main.js'
import { ThemeTokenCheck } from '@src/components/styled-renderer.client.js'
import { checkCandidates, nearestThemeContext, StaticStyles } from '@src/components/static-styles.js'
import { ThemeContext } from '@src/components/theme-provider.client.js'
import { NodeUtil } from '@src/util/node.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { __resetThemeDiagnostics, getTokensVarIndex, type ThemeVarIndex, type ThemeVarRef } from '@src/util/theme-diagnostics.util.js'
import { asThemeProps } from '../_theme-props.js'

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

const MISSING_COLOR = 'mn-00000000000mc'
const DEFINED_COLOR = 'mn-00000000000dc'
const MISSING_BG = 'mn-00000000000mb'
const DEFINED_BG = 'mn-00000000000db'
const HOVER_MISSING = 'mn-00000000000hm'
const SELECTOR_MISSING = 'mn-00000000000sm'
const WIDTH = 'mn-00000000000wd'
const SELECT_MISSING = 'mn-00000000000us'
const ACCENT = 'mn-00000000000ac'
const ACCENT_BG = 'mn-00000000000ab'

beforeEach(() => {
  __resetStaticCss()
  __resetThemeDiagnostics()
  registerStaticCss('diagnostics', [
    [0, MISSING_COLOR, `.${MISSING_COLOR}{color:var(--meonode-theme-primary-missing);}`],
    [0, DEFINED_COLOR, `.${DEFINED_COLOR}{color:var(--meonode-theme-primary);}`],
    [0, MISSING_BG, `.${MISSING_BG}{background-color:var(--meonode-theme-surface-missing);}`],
    [0, DEFINED_BG, `.${DEFINED_BG}{background-color:var(--meonode-theme-surface);}`],
    [0, WIDTH, `.${WIDTH}{width:var(--mv-00000000000wd);}`],
    // The prefixer writes a prefixed copy of the declaration; it is one token reference, as written.
    [0, SELECT_MISSING, `.${SELECT_MISSING}{-webkit-user-select:var(--meonode-theme-select-missing);user-select:var(--meonode-theme-select-missing);}`],
    [0, ACCENT, `.${ACCENT}{color:var(--meonode-theme-accent);}`],
    [0, ACCENT_BG, `.${ACCENT_BG}{background-color:var(--meonode-theme-accent);}`],
    [1, HOVER_MISSING, `.${HOVER_MISSING}:hover{color:var(--meonode-theme-hover-missing);}`],
    [3, SELECTOR_MISSING, `.${SELECTOR_MISSING} pre:not(.a){border-color:var(--meonode-theme-border-missing);}`],
  ])
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

function mount(element: ReactElement) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

/** The token warnings rendering `node` gives, from a fresh record of what was reported. */
function tokenWarnings(node: () => NodeInstance, withProvider = true): string[] {
  __resetThemeDiagnostics()
  warnings = []
  mount((withProvider ? ThemeProvider({ ...asThemeProps(theme as never), children: node() }) : node()).render() as ReactElement)
  return warnings.filter(text => text.includes('--meonode-theme-'))
}

/** Asserts the compiled call site warns exactly as the same call site uncompiled, and that it warns at all. */
function warnsAsUncompiled(uncompiled: () => NodeInstance, compiled: () => NodeInstance, withProvider = true) {
  const expected = tokenWarnings(uncompiled, withProvider)
  expect(expected.length).toBeGreaterThan(0)
  expect(tokenWarnings(compiled, withProvider)).toEqual(expected)
}

/** Asserts neither form warns. */
function quietAsUncompiled(uncompiled: () => NodeInstance, compiled: () => NodeInstance) {
  expect(tokenWarnings(uncompiled)).toEqual([])
  expect(tokenWarnings(compiled)).toEqual([])
}

/** A component that renders its children as given. */
const Wrapper = ({ children }: { children?: unknown }) => children as ReactElement

const compiled = (classes: string, rest: Record<string, unknown> = {}) => Div({ __meo$: 2, __meo$s: classes, ...rest } as never)

describe('a token the active theme does not define, extracted', () => {
  it('warns from a static rule', () => {
    warnsAsUncompiled(
      () => Div({ color: 'theme.primary.missing' }),
      () => compiled(MISSING_COLOR),
    )
  })

  it('warns from the branch a switch picked', () => {
    const open = true
    warnsAsUncompiled(
      () => Div({ backgroundColor: open ? 'theme.surface.missing' : 'theme.surface' }),
      () => compiled(open ? MISSING_BG : DEFINED_BG),
    )
  })

  // The branch not taken holds an undefined token too, but nothing renders it.
  it('stays quiet for the branch a switch did not pick', () => {
    const open = false
    quietAsUncompiled(
      () => Div({ backgroundColor: open ? 'theme.surface.missing' : 'theme.surface' }),
      () => compiled(open ? MISSING_BG : DEFINED_BG),
    )
  })

  it('warns from a variable’s value', () => {
    const value = 'calc(4px + theme.spacing.missing)'
    warnsAsUncompiled(
      () => Div({ width: value }),
      () => compiled(WIDTH, { __meo$v: { '--mv-00000000000wd': toCssValue('width', value) } }),
    )
  })

  it('warns from a pseudo-class rule', () => {
    warnsAsUncompiled(
      () => Div({ css: { '&:hover': { color: 'theme.hover.missing' } } }),
      () => compiled(HOVER_MISSING),
    )
  })

  it('warns from a per-node selector rule', () => {
    warnsAsUncompiled(
      () => Div({ css: { '& pre:not(.a)': { borderColor: 'theme.border.missing' } } }),
      () => compiled(SELECTOR_MISSING),
    )
  })

  it('warns once for a declaration the prefixer copied', () => {
    warnsAsUncompiled(
      () => Div({ userSelect: 'theme.select.missing' }),
      () => compiled(SELECT_MISSING),
    )
  })

  it('warns with no ThemeProvider above', () => {
    warnsAsUncompiled(
      () => Div({ color: 'theme.primary.missing' }),
      () => compiled(MISSING_COLOR),
      false,
    )
  })

  it('warns for a node deep in the walk, under a component', () => {
    warnsAsUncompiled(
      () => Div({ children: Node(Wrapper, { children: Span('y', { color: 'theme.primary.missing' }) }) }),
      () => Div({ children: Node(Wrapper, { children: Span('y', { __meo$: 2, __meo$s: MISSING_COLOR } as never) }) }),
    )
  })
})

describe('a node under a component inside the walk, which may provide another theme', () => {
  /** A component that renders its children inside a provider of its own, out of the walk's sight. */
  const InnerTheme = ({ children }: { children?: NodeInstance }) => ThemeProvider({ ...asThemeProps(inner as never), children }).render() as ReactElement

  it('stays quiet when a provider inside the component defines the token', () => {
    quietAsUncompiled(
      () => Div({ children: Node(InnerTheme, { children: Span('y', { color: 'theme.accent' }) }) }),
      () => Div({ children: Node(InnerTheme, { children: Span('y', { __meo$: 2, __meo$s: ACCENT } as never) }) }),
    )
  })

  it('warns when no provider above it defines the token', () => {
    warnsAsUncompiled(
      () => Div({ children: Node(InnerTheme, { children: Span('y', { color: 'theme.primary.missing' }) }) }),
      () => Div({ children: Node(InnerTheme, { children: Span('y', { __meo$: 2, __meo$s: MISSING_COLOR } as never) }) }),
    )
  })

  // The variables are declared on `:root`, so the page resolves a token a sibling
  // provider defines; the runtime checks the providers above the element, and so does this.
  it('warns for a token only a sibling provider defines, as the runtime does', () => {
    const page = (child: NodeInstance) =>
      Div({
        children: [
          ThemeProvider({ ...asThemeProps(inner as never), key: 'sibling', children: Div({ children: 's' }) }),
          Node(Wrapper, { key: 'w', children: child }),
        ],
      })
    warnsAsUncompiled(
      () => page(Span('y', { color: 'theme.accent' })),
      () => page(Span('y', { __meo$: 2, __meo$s: ACCENT } as never)),
    )
  })

  it('warns for a void element', () => {
    warnsAsUncompiled(
      () => Div({ children: Node(Wrapper, { children: Img({ color: 'theme.primary.missing' }) }) }),
      () => Div({ children: Node(Wrapper, { children: Img({ __meo$: 2, __meo$s: MISSING_COLOR } as never) }) }),
    )
  })

  it('warns from a variable’s value, on the element that sets it', () => {
    const value = 'calc(4px + theme.spacing.missing)'
    warnsAsUncompiled(
      () => Div({ children: Node(Wrapper, { children: Div({ width: value }) }) }),
      () => Div({ children: Node(Wrapper, { children: compiled(WIDTH, { __meo$v: { '--mv-00000000000wd': toCssValue('width', value) } }) }) }),
    )
  })

  // Another element with the same classes, outside that provider, does not borrow the variable.
  it('checks a variable on the element that sets it, not on another with the same classes', () => {
    quietAsUncompiled(
      () => Div({ children: [Div({ key: 'a', width: 4 }), Node(InnerTheme, { key: 'b', children: Div({ width: 'theme.accent' }) })] }),
      () =>
        Div({
          children: [
            compiled(WIDTH, { key: 'a', __meo$v: { '--mv-00000000000wd': '4px' } }),
            Node(InnerTheme, { key: 'b', children: compiled(WIDTH, { __meo$v: { '--mv-00000000000wd': toCssValue('width', 'theme.accent') } }) }),
          ],
        }),
    )
  })

  // An element with only some of a candidate's classes reads only their rules.
  it('checks an element only for a candidate whose classes it all has', () => {
    quietAsUncompiled(
      () =>
        Div({
          children: [
            Div({ key: 'a', color: 'theme.primary' }),
            Node(InnerTheme, { key: 'b', children: Div({ color: 'theme.primary', backgroundColor: 'theme.accent' }) }),
          ],
        }),
      () =>
        Div({
          children: [compiled(DEFINED_COLOR, { key: 'a' }), Node(InnerTheme, { key: 'b', children: compiled(`${DEFINED_COLOR} ${ACCENT_BG}`) })],
        }),
    )
  })

  // The accepted cost of a shape-free check: the server cannot see into the component.
  it('does not warn during a server render', () => {
    __resetThemeDiagnostics()
    warnings = []
    NodeUtil.isServer = true
    try {
      renderToString(
        ThemeProvider({
          ...asThemeProps(theme as never),
          children: Div({ children: Node(Wrapper, { children: compiled(MISSING_COLOR) }) }),
        }).render() as ReactElement,
      )
    } finally {
      NodeUtil.isServer = false
    }
    expect(warnings.filter(text => text.includes('--meonode-theme-'))).toEqual([])
  })
})

describe('a token the active theme defines, extracted', () => {
  it('stays quiet', () => {
    quietAsUncompiled(
      () => Div({ color: 'theme.primary', backgroundColor: 'theme.surface' }),
      () => compiled(`${DEFINED_COLOR} ${DEFINED_BG}`),
    )
  })

  it('stays quiet for a token only a provider inside the walk defines', () => {
    quietAsUncompiled(
      () => Div({ children: ThemeProvider({ ...asThemeProps(inner as never), children: Span('y', { color: 'theme.accent' }) }) }),
      () => Div({ children: ThemeProvider({ ...asThemeProps(inner as never), children: Span('y', { __meo$: 2, __meo$s: ACCENT } as never) }) }),
    )
  })
})

describe('a provider inside the walk, below its topmost host', () => {
  // A root layout written with MeoNode: hosts above the provider in the same
  // walk, so the walk's `StaticStyles` sits outside it.
  const layout = (child: NodeInstance) => Div({ children: Div({ children: ThemeProvider({ ...asThemeProps(theme as never), children: child }) }) })

  it('checks a node below it against it, not against what is above the walk', () => {
    quietAsUncompiledNoOuter(
      () => layout(Span('y', { color: 'theme.primary' })),
      () => layout(Span('y', { __meo$: 2, __meo$s: DEFINED_COLOR } as never)),
    )
    warnsAsUncompiled(
      () => layout(Span('y', { color: 'theme.primary.missing' })),
      () => layout(Span('y', { __meo$: 2, __meo$s: MISSING_COLOR } as never)),
      false,
    )
  })

  it('does so during a server render too', () => {
    const serverWarnings = (node: NodeInstance) => {
      __resetThemeDiagnostics()
      warnings = []
      NodeUtil.isServer = true
      try {
        renderToString(node.render() as ReactElement)
      } finally {
        NodeUtil.isServer = false
      }
      return warnings.filter(text => text.includes('--meonode-theme-'))
    }
    expect(serverWarnings(layout(Span('y', { __meo$: 2, __meo$s: DEFINED_COLOR } as never)))).toEqual([])
    expect(serverWarnings(layout(Span('y', { __meo$: 2, __meo$s: MISSING_COLOR } as never)))).toEqual(
      serverWarnings(layout(Span('y', { color: 'theme.primary.missing' }))),
    )
    expect(serverWarnings(layout(Span('y', { color: 'theme.primary.missing' })))).toHaveLength(1)
  })
})

/** Asserts neither form warns, with no provider above the walk. */
function quietAsUncompiledNoOuter(uncompiled: () => NodeInstance, compiled: () => NodeInstance) {
  expect(tokenWarnings(uncompiled, false)).toEqual([])
  expect(tokenWarnings(compiled, false)).toEqual([])
}

/** Every fiber below `container`'s root, as React holds them. */
interface Fiber {
  type: unknown
  dependencies: unknown
  child: Fiber | null
  sibling: Fiber | null
  return: Fiber | null
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

  const tree = () =>
    ThemeProvider({
      ...asThemeProps(theme as never),
      children: Div({ children: [compiled(MISSING_COLOR, { key: 'a' }), Node(Wrapper, { key: 'b', children: compiled(MISSING_BG) })] }),
    })

  /** The page's markup, its fibers, and the token warnings, for one mode. */
  function renderIn(mode: 'development' | 'production') {
    vi.stubEnv('NODE_ENV', mode)
    __resetThemeDiagnostics()
    warnings = []
    NodeUtil.isServer = true
    let html: string
    try {
      html = renderToString(tree().render() as ReactElement)
    } finally {
      NodeUtil.isServer = false
    }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => root.render(tree().render() as ReactElement))
    const fibers = fibersOf(container)
    return {
      html,
      warnings: warnings.filter(text => text.includes('--meonode-theme-')),
      fibers: fibers.map(fiber => typeName(fiber.type)),
      staticStyles: fibers.filter(fiber => fiber.type === StaticStyles),
    }
  }

  it('checks nothing and reads no theme context for static css, with the same markup and fibers', () => {
    const development = renderIn('development')
    const production = renderIn('production')

    // The development run shows what the production run is held to: both nodes reported, the context read.
    expect(development.warnings).toHaveLength(2)
    expect(development.staticStyles.every(fiber => fiber.dependencies !== null)).toBe(true)

    expect(production.warnings).toEqual([])
    expect(production.staticStyles.length).toBeGreaterThan(0)
    expect(production.staticStyles.every(fiber => fiber.dependencies === null)).toBe(true)
    expect(production.html).toBe(development.html)
    expect(production.fibers).toEqual(development.fibers)
    expect(production.fibers).not.toContain(ThemeTokenCheck.name)
  })

  // `setDebugMode` can be on in a production build; it checks what it can while rendering.
  it('with debug mode on, checks a node in the scope of StaticStyles, not one under a component', () => {
    setDebugMode(true)
    try {
      const { warnings: reported } = renderIn('production')
      expect(reported).toHaveLength(1)
      expect(reported[0]).toContain('--meonode-theme-primary-missing')
      // A production build has no effect to check them with, so none are collected.
      const props = staticStylesProps(tree().render())
      expect(props.length).toBeGreaterThan(0)
      expect(props.every(entry => !('candidates' in entry))).toBe(true)
      expect(props.some(entry => 'checks' in entry)).toBe(true)
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
    renderToString(node.render() as ReactElement)
  } finally {
    NodeUtil.isServer = false
  }
  return warnings.filter(text => text.includes('--meonode-theme-'))
}

/** The props of every `StaticStyles` element in a rendered element tree. */
function staticStylesProps(element: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = []
  const stack = [element]
  while (stack.length > 0) {
    const item = stack.pop()
    if (Array.isArray(item)) stack.push(...item)
    else if (item && typeof item === 'object' && 'props' in item) {
      const { type, props } = item as { type: unknown; props: Record<string, unknown> }
      if (type === StaticStyles) found.push(props)
      stack.push(props.children)
    }
  }
  return found
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

  // The component is above the topmost host, so `StaticStyles` renders inside it, in the node's scope.
  it('warns for a node under a component above the topmost host', () => {
    expect(
      serverTokenWarnings(
        ThemeProvider({ ...asThemeProps(theme as never), children: Node(Wrapper, { children: Div({ children: compiled(MISSING_COLOR) }) }) }),
      ),
    ).toHaveLength(1)
  })

  // Candidates are checked in the browser after commit; the server has no use for them.
  it('hands StaticStyles no candidates', () => {
    NodeUtil.isServer = true
    try {
      const props = staticStylesProps(Div({ children: Node(Wrapper, { children: compiled(MISSING_COLOR) }) }).render())
      expect(props.length).toBeGreaterThan(0)
      expect(props.every(entry => !('candidates' in entry))).toBe(true)
    } finally {
      NodeUtil.isServer = false
    }
  })

  it('warns for a node checked inside StaticStyles', () => {
    __resetThemeDiagnostics()
    warnings = []
    NodeUtil.isServer = true
    try {
      renderToString(ThemeProvider({ ...asThemeProps(theme as never), children: compiled(MISSING_COLOR) }).render() as ReactElement)
    } finally {
      NodeUtil.isServer = false
    }
    const reported = warnings.filter(text => text.includes('--meonode-theme-primary-missing'))
    expect(reported).toHaveLength(1)
    expect(reported[0]).toContain('is not defined by the active theme')
  })
})

describe('reading the nearest provider through React’s fiber', () => {
  function rendered(): Element {
    mount(
      ThemeProvider({
        ...asThemeProps(theme as never),
        children: Div({ children: Node(Wrapper, { children: compiled(DEFINED_COLOR, { id: 'read' }) }) }),
      }).render() as ReactElement,
    )
    return document.getElementById('read')!
  }
  const fiberKey = (element: Element) => Object.keys(element).find(name => name.startsWith('__reactFiber$'))!

  it('finds the provider above the element', () => {
    expect(nearestThemeContext(rendered())?.definedVars().has('--meonode-theme-primary')).toBe(true)
  })

  it('finds none above an element with no provider', () => {
    mount(Div({ children: compiled(DEFINED_COLOR, { id: 'bare' }) }).render() as ReactElement)
    expect(nearestThemeContext(document.getElementById('bare')!)).toBeNull()
  })

  it('cannot tell without the fiber key', () => {
    const element = rendered()
    delete (element as unknown as Record<string, unknown>)[fiberKey(element)]
    expect(nearestThemeContext(element)).toBeUndefined()
  })

  it.each([
    ['return', { type: 'span' }],
    ['type', { return: null }],
  ])('cannot tell when a fiber lacks `%s`', (_, fiber) => {
    const element = rendered()
    ;(element as unknown as Record<string, unknown>)[fiberKey(element)] = fiber
    expect(nearestThemeContext(element)).toBeUndefined()
  })
})

describe('an element whose fiber cannot be read', () => {
  /** Renders a candidate, takes the fiber key off its element, and checks it again. */
  // Rendered with a defined token, so nothing is reported before the check under test.
  async function checkWithoutFiber(refs: ThemeVarRef[]) {
    const classes = DEFINED_COLOR
    mount(
      ThemeProvider({
        ...asThemeProps(theme as never),
        children: Div({ children: Node(Wrapper, { children: compiled(classes, { id: 'unread' }) }) }),
      }).render() as ReactElement,
    )
    const element = document.getElementById('unread')!
    delete (element as unknown as Record<string, unknown>)[Object.keys(element).find(name => name.startsWith('__reactFiber$'))!]
    // The record of mounted providers is kept: it is what the element is checked against.
    warnings = []
    checkCandidates([{ classes, refs, valueRefs: [] }])
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

  it('is checked against the providers above it in the tree, not in the document', () => {
    const InnerTheme = ({ children }: { children?: NodeInstance }) => ThemeProvider({ ...asThemeProps(inner as never), children }).render() as ReactElement
    quietAsUncompiled(
      () => Div({ children: Node(InnerTheme, { children: Node(InPortal, { children: Span('y', { color: 'theme.accent' }) }) }) }),
      () => Div({ children: Node(InnerTheme, { children: Node(InPortal, { children: Span('y', { __meo$: 2, __meo$s: ACCENT } as never) }) }) }),
    )
    warnsAsUncompiled(
      () => Div({ children: Node(InPortal, { children: Span('y', { color: 'theme.accent' }) }) }),
      () => Div({ children: Node(InPortal, { children: Span('y', { __meo$: 2, __meo$s: ACCENT } as never) }) }),
    )
  })
})

describe('a node directly under a component at the top of the walk', () => {
  // No host can carry its `StaticStyles` above it, so that renders beside the
  // walk's root, outside the component, and the node is checked after commit.
  it('is checked against a provider inside the component', () => {
    const InnerTheme = ({ children }: { children?: NodeInstance }) => ThemeProvider({ ...asThemeProps(inner as never), children }).render() as ReactElement
    quietAsUncompiled(
      () => Node(InnerTheme, { children: Img({ color: 'theme.accent' }) }),
      () => Node(InnerTheme, { children: Img({ __meo$: 2, __meo$s: ACCENT } as never) }),
    )
  })
})

describe('a ThemeProvider’s tokens, read from its node', () => {
  it('give the variables the provider itself defines', () => {
    const tokens = { primary: { default: 'red', content: 'white' }, spacing: { md: 16 }, flag: true, none: null, brand: { light: '#a', dark: '#b' } }
    let defined: ThemeVarIndex | undefined
    const Read = () => {
      defined = use(ThemeContext)!.definedVars()
      return null
    }
    mount(ThemeProvider({ tokens, modes: ['light'], defaultMode: 'light', children: Node(Read) } as never).render() as ReactElement)

    expect([...getTokensVarIndex(tokens)]).toEqual([...defined!])
    expect(defined!.size).toBeGreaterThan(3)
  })
})
