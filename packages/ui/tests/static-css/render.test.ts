// @vitest-environment jsdom
//
// What a node the compiler named renders in the browser, against the same call
// site uncompiled. Each node here is compiled output written by hand in the
// contract's shape: its whole style's name in `__meo$n`, registered by its
// module. Each tree renders from a component, where an app's walk runs.
import { serializeStyles } from '@emotion/serialize'
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Div, ThemeProvider, type NodeInstance, type Theme } from '@src/main.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { asThemeProps } from '../_theme-props.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Css = Record<string, unknown>

/** The style of the call sites below: `Div({ color: 'red', '&:hover': { color: 'blue' } })`. */
const STYLE: Css = { color: 'red', '&:hover': { color: 'blue' } }

/** The name and text the compiler computes for `css`. */
function nameOf(css: Css): { name: string; styles: string } {
  const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  return nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
}

const { name: NAME, styles: STYLES } = nameOf(STYLE)

/** A compiled host call site of {@link STYLE}, with `rest` as its other props. */
const compiled = (rest: Record<string, unknown> = {}) => Div({ __meo$: 2, __meo$n: NAME, ...rest } as never)
/** The same call site uncompiled. */
const uncompiled = (rest: Record<string, unknown> = {}) => Div({ css: STYLE, ...rest })

let roots: Root[] = []

/** Mounts `tree` rendered from a component, and gives its container's markup. */
function mount(tree: () => NodeInstance | ReactElement): string {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  roots.push(root)
  act(() =>
    root.render(
      createElement(function Page() {
        const made = tree()
        return ('render' in made ? made.render() : made) as ReactElement
      }),
    ),
  )
  return container.innerHTML
}

beforeEach(() => {
  __resetStaticCss()
  registerStaticCss('module-a', [[NAME, STYLES]])
})
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  document.body.innerHTML = ''
})

describe('a named node', () => {
  it('renders the markup of the call site uncompiled', () => {
    expect(mount(() => compiled({ children: 'x' }))).toBe(mount(() => uncompiled({ children: 'x' })))
  })

  it('puts its class with a className as the call site uncompiled does', () => {
    expect(mount(() => compiled({ className: 'own', children: 'x' }))).toBe(mount(() => uncompiled({ className: 'own', children: 'x' })))
    expect(mount(() => compiled({ __meo$d: { className: 'own' }, children: 'x' }))).toBe(mount(() => uncompiled({ className: 'own', children: 'x' })))
  })

  it('renders as uncompiled after a runtime sibling, which it does not carry', () => {
    const tree = (style: typeof compiled) => Div({ children: [Div({ key: 'r', css: { order: 1 } }), style({ key: 'n', children: 'x' })] })
    expect(mount(() => tree(compiled))).toBe(mount(() => tree(uncompiled)))
  })
})

describe('compiled output rendered as an element under another node', () => {
  const theme: Theme = { mode: 'light', system: { colors: { primary: 'red' } } }

  it.each<[string, (child: ReactElement) => NodeInstance]>([
    ['a node', child => Div({ children: child })],
    ['a ThemeProvider', child => ThemeProvider({ ...asThemeProps(theme), children: child })],
    ['a node inside a ThemeProvider', child => ThemeProvider({ ...asThemeProps(theme), children: Div({ children: [child] }) })],
  ])('renders as uncompiled under %s', (_, parent) => {
    const html = (style: typeof compiled) => mount(() => parent(style({ key: 'c', className: 'own', children: 'x' }).render() as ReactElement))
    expect(html(compiled)).toBe(html(uncompiled))
  })
})

describe('a node with Emotion disabled', () => {
  it('takes no class under an ancestor that disabled it, as uncompiled', () => {
    const tree = (style: typeof compiled) => Div({ disableEmotion: true, children: [style({ key: 'c', className: 'own', children: 'x' })] })
    expect(mount(() => tree(compiled))).toBe('<div><div class="own">x</div></div>')
    expect(mount(() => tree(compiled))).toBe(mount(() => tree(uncompiled)))
  })

  it('takes none when it disabled Emotion itself, as uncompiled', () => {
    expect(mount(() => compiled({ disableEmotion: true, children: 'x' }))).toBe('<div>x</div>')
    expect(mount(() => compiled({ disableEmotion: true, children: 'x' }))).toBe(mount(() => uncompiled({ disableEmotion: true, children: 'x' })))
  })
})

describe('a node whose name no module registered', () => {
  it('says so in development and renders without the style', () => {
    __resetStaticCss()
    registerStaticCss('module-b', [['other', 'order:1;']])
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(mount(() => compiled({ children: 'x' }))).toBe('<div>x</div>')
      expect(error.mock.calls.map(call => String(call[0])).filter(text => text.includes(NAME))).toEqual([
        `[MeoNode] The static style \`${NAME}\` is used but no module registered it, so no rule is sent for it.`,
      ])
    } finally {
      error.mockRestore()
    }
  })
})

describe('the markers', () => {
  it('never reach the element', () => {
    let element: ReactElement<Record<string, unknown>> | undefined
    mount(() => (element = compiled({ __meo$c: { padding: 4 }, __meo$r: 1 }).render() as ReactElement<Record<string, unknown>>))
    for (const key of Object.keys(element!.props)) expect(key.startsWith('__meo$')).toBe(false)
    mount(() => (element = Div({ children: [Div({ key: 'r', css: { order: 1 } }), compiled({ key: 'n' })] }).render() as ReactElement<Record<string, unknown>>))
    const named = (element!.props.children as ReactElement<Record<string, unknown>>[]).flat()[1]
    for (const key of Object.keys(named.props)) expect(key.startsWith('__meo$')).toBe(false)
  })

  it('are ignored by schema 1, which never had them', () => {
    expect(mount(() => Div({ __meo$: 1, __meo$n: NAME, children: 'x' } as never))).toBe('<div>x</div>')
  })
})
