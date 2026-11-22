// @vitest-environment jsdom
//
// The development warning for a theme token the theme in scope does not
// define, for a compiled node that carries its whole style's name. Uncompiled,
// `StyledRenderer` reports such a token where it renders. Compiled, the element
// renders plain, so the walk checks the style's text, with nothing added to
// the render: in render, in the walk's own theme scope, and on the element once
// committed when a component between them may provide another theme. Each case
// compares the warnings with those of the same call site uncompiled.
import { serializeStyles } from '@emotion/serialize'
import { createElement, act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Div, Node, Span, ThemeProvider, type NodeInstance } from '@src/main.js'
import { NodeUtil } from '@src/util/node.util.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { __resetThemeDiagnostics } from '@src/util/theme-diagnostics.util.js'
import { asThemeProps } from '../_theme-props.js'
import { withRenderShapes } from './_render-shapes.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Renders `make`'s element from a component, where an app's walk runs and reads its cache. */
const inRender = (make: () => ReactElement): ReactElement =>
  createElement(function Page() {
    return make()
  })

const theme = { mode: 'light', system: { primary: { default: 'rgb(0, 0, 255)' } } } as const
/** A theme for a provider inside a component, defining one more token. */
const inner = { mode: 'light', system: { accent: 'rgb(0, 128, 0)' } } as const

type Css = Record<string, unknown>

/** Props for a node of `css` as the compiler emits it: its tokens as variables, its style named and registered. */
function named(css: Css): Record<string, unknown> {
  const resolved = ThemeUtil.resolveObjWithTheme(replaceThemeTokensWithCssVars(css), undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const { name, styles } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  registerStaticCss(`m-${name}`, [[name, styles]])
  return { __meo$: 2, __meo$n: name }
}

let warnings: string[] = []
let originalWarn: typeof console.warn
let roots: Root[] = []
beforeEach(() => {
  __resetStaticCss()
  warnings = []
  originalWarn = console.warn
  console.warn = (...args: unknown[]) => void warnings.push(String(args[0]))
})
afterEach(() => {
  console.warn = originalWarn
  for (const root of roots) act(() => root.unmount())
  roots = []
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  __resetStaticCss()
})

/** The token warnings rendering `node` gives, from a fresh record of what was reported. */
function tokenWarnings(node: () => NodeInstance, withProvider = true): string[] {
  __resetThemeDiagnostics()
  warnings = []
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  roots.push(root)
  act(() =>
    root.render(inRender(() => (withProvider ? ThemeProvider({ ...asThemeProps(theme as never), children: node() }) : node()).render() as ReactElement)),
  )
  return warnings.filter(text => text.includes('--meonode-theme-'))
}

/** A component that renders its children inside a provider of its own, out of the walk's sight. */
const InnerTheme = ({ children }: { children?: NodeInstance }) => ThemeProvider({ ...asThemeProps(inner as never), children }).render() as ReactElement

/** Each case: the tree, given how a node gets `css`, and whether it renders under the outer provider. */
const WARNS: Record<string, [tree: (style: (css: Css) => Record<string, unknown>) => NodeInstance, withProvider: boolean]> = {
  'a missing token in a declaration': [style => Div(style({ color: 'theme.primary.missing' })), true],
  'a missing token under a nested selector': [style => Div(style({ '&:hover': { color: 'theme.primary.missing' } })), true],
  'a missing token with no provider above': [style => Div(style({ color: 'theme.primary' })), false],
  'a missing token deep in the walk': [style => Div({ children: Div({ children: Span('y', style({ backgroundColor: 'theme.primary.missing' })) }) }), true],
  'a token no provider above defines, under a component with its own': [
    style => Div({ children: Node(InnerTheme, { children: Span('y', style({ color: 'theme.primary.missing' })) }) }),
    true,
  ],
}

const QUIET: Record<string, (style: (css: Css) => Record<string, unknown>) => NodeInstance> = {
  'a token the theme defines': style => Div(style({ color: 'theme.primary' })),
  'a token a provider inside a component defines': style => Div({ children: Node(InnerTheme, { children: Span('y', style({ color: 'theme.accent' })) }) }),
}

const runtime = (css: Css) => ({ css })

describe('a token the theme in scope does not define, on a named node', () => {
  it.each(Object.entries(WARNS))('warns as uncompiled for %s', async (_, [tree, withProvider]) => {
    const expected = tokenWarnings(() => tree(runtime), withProvider)
    expect(expected.length).toBeGreaterThan(0)
    tokenWarnings(() => tree(named), withProvider)
    // A check after commit reports on a later task.
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(warnings.filter(text => text.includes('--meonode-theme-'))).toEqual(expected)
  })

  it.each(Object.entries(QUIET))('stays quiet as uncompiled for %s', async (_, tree) => {
    expect(tokenWarnings(() => tree(runtime))).toEqual([])
    tokenWarnings(() => tree(named))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(warnings.filter(text => text.includes('--meonode-theme-'))).toEqual([])
  })

  it('stays quiet in a server render, as uncompiled', () => {
    const render = (style: (css: Css) => Record<string, unknown>) => {
      __resetThemeDiagnostics()
      warnings = []
      NodeUtil.isServer = true
      try {
        renderToString(
          inRender(() => ThemeProvider({ ...asThemeProps(theme as never), children: Div(style({ color: 'theme.primary.missing' })) }).render() as ReactElement),
        )
      } finally {
        NodeUtil.isServer = false
      }
      return warnings.filter(text => text.includes('--meonode-theme-'))
    }
    expect(render(named)).toEqual(render(runtime))
  })
})

// A named node under a carrier, as the compiler marks the first of a run: its
// tokens are checked by the walk, the carrier's by `StyledRenderer`. Neither adds
// anything to what `.render()` returns.
describe('a named node’s token check, under a carrier', () => {
  const carried = (css: Css) => ({ ...named(css), __meo$r: 1 })
  const TREES: Record<
    string,
    [tree: (style: (css: Css) => Record<string, unknown>, carrier: (css: Css) => Record<string, unknown>) => NodeInstance, warns: boolean]
  > = {
    'a missing token in the walk’s theme scope': [
      (style, carrier) => Div({ ...carrier({ display: 'grid' }), children: Span('y', style({ color: 'theme.primary.missing' })) }),
      true,
    ],
    'a defined token in the walk’s theme scope': [
      (style, carrier) => Div({ ...carrier({ display: 'grid' }), children: Span('y', style({ color: 'theme.primary' })) }),
      false,
    ],
    'a token a ThemeProvider node in the walk defines': [
      (style, carrier) =>
        Div({
          ...carrier({ display: 'grid' }),
          children: ThemeProvider({ ...asThemeProps(inner as never), children: Span('y', style({ color: 'theme.accent' })) }),
        }),
      false,
    ],
    // Inside a component the stretch begins again, at a carrier of its own.
    'a token a provider inside a component defines': [
      (style, carrier) =>
        Div({
          ...carrier({ display: 'grid' }),
          children: Node(InnerTheme, {
            children: [Span('x', { key: 'x', ...carrier({ order: 1 }) }), Span('y', { key: 'y', ...style({ color: 'theme.accent' }) })],
          }),
        }),
      false,
    ],
    'a missing token under a component with its own provider': [
      (style, carrier) =>
        Div({
          ...carrier({ display: 'grid' }),
          children: Node(InnerTheme, {
            children: [Span('x', { key: 'x', ...carrier({ order: 1 }) }), Span('y', { key: 'y', ...style({ color: 'theme.primary.missing' }) })],
          }),
        }),
      true,
    ],
  }
  it.each(Object.entries(TREES))('warns as uncompiled and adds nothing to the render, for %s', async (_, [tree, warns]) => {
    const run = (style: (css: Css) => Record<string, unknown>, carrier: (css: Css) => Record<string, unknown>) =>
      withRenderShapes(() => ({ warnings: tokenWarnings(() => tree(style, carrier)) }))
    const expected = run(runtime, runtime)
    expect(expected.warnings.length > 0).toBe(warns)
    const compiled = run(named, carried)
    // A check after commit reports on a later task.
    await new Promise(resolve => setTimeout(resolve, 50))
    expect({ ...compiled, warnings: warnings.filter(text => text.includes('--meonode-theme-')) }).toEqual(expected)
  })
})
