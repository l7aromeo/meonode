// @vitest-environment node
//
// Compiled nodes that carry their whole style's name, rendered on the server,
// against the same tree with every node's css on the runtime path. Emotion
// writes each runtime node's rule in place, before its element; a compiled
// node's goes in with the rule of the next runtime node, or at the end of its
// carrier. So the elements and their classes must match, and the rules must
// reach the page in the same order, a rule written again counted again.
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { serializeStyles } from '@emotion/serialize'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { Div, Node, Span, type NodeInstance } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { templated } from './_template.js'

type Css = Record<string, unknown>

/** The name and text the runtime computes for `css`, which the compiler writes for it. */
function compile(css: Css): { name: string; styles: string } {
  const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const serialized = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  return { name: serialized.name, styles: serialized.styles }
}

/** Props giving a node `css`, and with `slots` the positions the compiler marks among a host's children. */
type Style = ((css: Css, isStatic?: boolean) => Record<string, unknown>) & { slots: (...paths: (number | number[])[]) => Record<string, unknown> }
const runtimeStyle: Style = Object.assign((css: Css) => ({ css }), { slots: () => ({}) })
const compiledStyle: Style = Object.assign(
  (css: Css, isStatic = true) => {
    if (!isStatic) return { css }
    const { name, styles } = compile(css)
    registerStaticCss(`m-${name}`, [[name, styles]])
    return { __meo$: 2, __meo$n: name }
  },
  { slots: (...paths: (number | number[])[]) => ({ __meo$: 2, __meo$p: paths }) },
)

const STYLE_ELEMENT = /<style data-emotion="([^"]*)"[^>]*>(.*?)<\/style>/g

/** The page's markup without its style elements, and the rules they hold, in order. */
function read(html: string): { markup: string; rules: string[] } {
  const rules: string[] = []
  for (const [, , text] of html.matchAll(STYLE_ELEMENT)) {
    for (const rule of text.split(/(?<=\})(?=[.@])/)) if (rule) rules.push(rule)
  }
  return { markup: html.replace(STYLE_ELEMENT, ''), rules }
}

function render(tree: (style: Style) => NodeInstance, style: Style, provider: boolean): ReturnType<typeof read> {
  __resetStaticCss()
  const element = tree(style).render() as ReactElement
  return read(renderToString(provider ? createElement(CacheProvider, { value: createCache({ key: 'css' }) }, element) : element))
}

const RED = { color: 'rgb(200, 0, 0)' }
const BLUE = { color: 'rgb(0, 0, 200)' }

const CASES: Record<string, (style: Style) => NodeInstance> = {
  'a parent’s & > * against its static child’s colour': style => Div({ ...style({ '& > *': RED }), children: Span('c', style(BLUE)) }),
  'a runtime parent’s & > * against a static child': style => Div({ ...style({ '& > *': RED }, false), children: Span('c', style(BLUE)) }),
  'a static parent and child written twice, in one run before a runtime node': style => {
    const pair = (key: number) => Div({ key, ...style({ '& > *': RED }), children: Span('c', style(BLUE)) })
    return Div({ children: [pair(1), pair(2), Div({ key: 3, ...style({ order: 3 }, false) })] })
  },
  'a static parent and child written twice, at the end of their carrier': style => {
    const pair = (key: number) => Div({ key, ...style({ '& > *': RED }), children: Span('c', style(BLUE)) })
    return Div({ children: [pair(1), pair(2)] })
  },
  'a static parent’s & > * against a runtime child': style => Div({ ...style({ '& > *': RED }), children: Span('c', style(BLUE, false)) }),
  'a runtime grandparent and a static parent reaching one element': style =>
    Div({ ...style({ '& .t': RED }, false), children: Div({ ...style({ '& .t': BLUE }), children: Span('t', { className: 't' }) }) }),
  'statics and runtimes interleaved among siblings': style =>
    Div({
      children: [
        Div({ key: 1, ...style({ order: 1 }) }),
        Div({ key: 2, ...style({ order: 2 }, false) }),
        Div({ key: 3, ...style({ order: 3 }) }),
        Div({ key: 4, ...style({ order: 4 }) }),
        Div({ key: 5, ...style({ order: 5 }, false), children: Div(style({ order: 6 })) }),
        Div({ key: 7, ...style({ order: 7 }) }),
      ],
    }),
  'a parent and child written twice, the parent’s & > * against the child’s own colour': style => {
    const pair = (key: number) => Div({ key, ...style({ '& > *': RED }), children: Span('c', style(BLUE, false)) })
    return Div({ children: [pair(1), pair(2)] })
  },
  'a parent’s & .child against a component child’s own .wrapper &, the child’s position marked': style => {
    const Child = () => Span('c', { className: 'child', ...style({ '.wrapper &': BLUE }) }).render() as ReactElement
    return Div({ className: 'wrapper', ...style({ '& .child': RED }), ...style.slots(0), children: Node(Child) })
  },
  'a sibling’s & + .item against a component inside a nested array, its path marked': style => {
    const Item = () => Div({ className: 'item', ...style({ '.wrapper &': BLUE }) }).render() as ReactElement
    return Div({
      className: 'wrapper',
      ...style.slots([1, 1]),
      children: [Span('a', { key: 'a', ...style({ order: 1 }) }), [Span('s', { key: 's', ...style({ '& + .item': RED }) }), Node(Item, { key: 'i' })]],
    })
  },
  'templated nodes, a value known only at run time, among named and runtime ones': style =>
    Div({
      children: [
        Div({ key: 1, ...(style === runtimeStyle ? { css: { width: '37%' } } : templated({ width: '37%' }, ['width'])) }),
        Div({ key: 2, ...style({ order: 2 }, false) }),
        Div({ key: 3, ...(style === runtimeStyle ? { css: { width: '37%' } } : templated({ width: '37%' }, ['width'])) }),
        Div({ key: 4, ...style({ order: 4 }) }),
      ],
    }),
  'two nodes of one style': style =>
    Div({ children: [Div({ key: 1, ...style(BLUE) }), Div({ key: 2, ...style(RED, false) }), Div({ key: 3, ...style(BLUE) })] }),
  'a registered class handed to a static node': style => {
    const Box = (props: { className?: string }) => Div({ className: props.className, ...style(BLUE) }).render() as ReactElement
    return Div({ children: Node(Box, { ...style(RED, false), className: 'given' }) })
  },
}

afterEach(() => __resetStaticCss())

describe.each([
  ['with no cache provider', false],
  ['under a cache provider', true],
])('a server render %s', (_, provider) => {
  it.each(Object.entries(CASES))('%s', (_, tree) => {
    const expected = render(tree, runtimeStyle, provider)
    expect(expected.rules.length).toBeGreaterThan(0)
    expect(render(tree, compiledStyle, provider)).toEqual(expected)
  })
})
