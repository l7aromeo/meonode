// @vitest-environment node
//
// Carriers on the server: a carrier renders its run with its own rule, in
// place, as a runtime node's `StyledRenderer` does, so the page has the same
// elements and its rules come out in the same order as the tree with every
// node's css on the runtime path, with no element added for them.
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { serializeStyles } from '@emotion/serialize'
import { createElement, useState, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { Button, Component, Div, Node, Span, type NodeInstance } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'

type Css = Record<string, unknown>
type Style = (css: Css, options?: { carrier?: boolean; runtime?: boolean }) => Record<string, unknown>
const runtimeStyle: Style = css => ({ css })
const compiledStyle: Style = (css, options) => {
  if (options?.runtime) return { css }
  const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const { name, styles } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  registerStaticCss(`m-${name}`, [[name, styles]])
  return { __meo$: 2, __meo$n: name, ...(options?.carrier && { __meo$r: 1 }) }
}
const carrier = { carrier: true }
const slots = (style: Style, ...paths: number[]) => (style === compiledStyle ? { __meo$: 2, __meo$p: paths } : {})
const RED = { color: 'rgb(200, 0, 0)' }
const BLUE = { color: 'rgb(0, 0, 200)' }
const GRID = { display: 'grid' }

function Counter({ label }: { label: string }) {
  const [count] = useState(0)
  return Button(`${label}:${count}`).render() as ReactElement
}

const STYLE_ELEMENT = /<style data-emotion="([^"]*)"[^>]*>(.*?)<\/style>/g
function read(html: string): { markup: string; rules: string[] } {
  const rules: string[] = []
  for (const [, , text] of html.matchAll(STYLE_ELEMENT)) for (const rule of text.split(/(?<=\})(?=[.@])/)) if (rule) rules.push(rule)
  return { markup: html.replace(STYLE_ELEMENT, ''), rules }
}
function render(tree: (style: Style) => NodeInstance, style: Style, provider: boolean) {
  __resetStaticCss()
  const element = createElement(function Page() {
    return tree(style).render() as ReactElement
  })
  return read(renderToString(provider ? createElement(CacheProvider, { value: createCache({ key: 'css' }) }, element) : element))
}

const CASES: Record<string, (style: Style) => NodeInstance> = {
  'a sibling’s & + .item against a Component sibling’s own rule, no carrier': style => {
    const Item = Component(() => Div({ className: 'item', ...style({ '.wrapper &': BLUE }) }))
    return Div({ className: 'wrapper', ...slots(style, 1), children: [Span('s', { key: 's', ...style({ '& + .item': RED }) }), Item({ key: 'i' })] })
  },
  'a static parent’s & .child against a Component child’s own .wrapper &, no carrier': style => {
    const Child = Component(() => Span('c', { className: 'child', ...style({ '.wrapper &': BLUE }) }))
    return Div({ className: 'wrapper', ...style({ '& .child': RED }), ...slots(style, 0), children: Child() })
  },
  'Components between statics, written with Node, the scope root a carrier': style => {
    const Item = Component(() => Div({ className: 'item', ...style({ order: 7 }) }))
    // With no provider the root is the scope of every walk below it, which only a carrier can give its cache to.
    return Div({
      ...style(GRID, carrier),
      ...slots(style, 1, 3),
      children: [
        Span('a', { key: 'a', ...style({ '& ~ .item': RED }) }),
        Node(Item, { key: 'i' }),
        Span('b', { key: 'b', ...style(BLUE) }),
        Node(Item, { key: 'j' }),
      ],
    })
  },
  'a parent’s & .child against a component child’s own .wrapper &': style => {
    const Child = () => Span('c', { className: 'child', ...style({ '.wrapper &': BLUE }, carrier) }).render() as ReactElement
    return Div({ className: 'wrapper', ...style({ '& .child': RED }, carrier), children: Node(Child) })
  },
  'a sibling’s & + .item against a component sibling’s own rule': style => {
    const Item = () => Div({ className: 'item', ...style({ '.wrapper &': BLUE }, carrier) }).render() as ReactElement
    return Div({ className: 'wrapper', children: [Span('s', { key: 's', ...style({ '& + .item': RED }, carrier) }), Node(Item, { key: 'i' })] })
  },
  'statics after a runtime node, before a component': style => {
    const Item = () => Div({ className: 'item', ...style({ '.wrapper &': BLUE }, carrier) }).render() as ReactElement
    return Div({
      className: 'wrapper',
      children: [
        Span('r', { key: 'r', ...style({ order: 1 }, { runtime: true }) }),
        Span('s', { key: 's', ...style({ '& + .item': RED }) }),
        Node(Item, { key: 'i' }),
      ],
    })
  },
  'a whole static tree, parent and children written twice': style => {
    const pair = (key: number) => Div({ key, ...style({ '& > *': RED }), children: Span('c', style(BLUE)) })
    return Div({ ...style(GRID, carrier), children: [pair(1), pair(2)] })
  },
  'statics after the last component, at the end': style =>
    Div({
      className: 'wrapper',
      ...style(GRID, carrier),
      children: [
        Node(Counter, { key: 'i', label: 'i' }),
        Span('t', { key: 't', ...style({ '& + span': RED }, carrier) }),
        Span('u', { key: 'u', ...style(BLUE) }),
      ],
    }),
  'a counter, a static host, a counter': style =>
    Div({
      ...style(GRID, carrier),
      children: [Node(Counter, { label: 'x' }), Span('h', { ...style(BLUE, carrier) }), Node(Counter, { label: 'b' })],
    }),
}

afterEach(() => __resetStaticCss())

describe.each([
  ['with no cache provider', false],
  ['under a cache provider', true],
])('a server render with carriers %s', (_, provider) => {
  it.each(Object.entries(CASES))('%s', (__, tree) => {
    const expected = render(tree, runtimeStyle, provider)
    expect(expected.rules.length).toBeGreaterThan(0)
    expect(render(tree, compiledStyle, provider)).toEqual(expected)
  })
})

// An element made once and rendered by several requests: each server render
// hands the element its own run, so a later page whose stretch before it
// differs gets none of an earlier page's.
describe('a Component element shared by two server renders', () => {
  it.each([
    ['with no cache provider', false],
    ['under a cache provider', true],
  ])('%s, starts each with its own page’s run', (_, provider) => {
    const pages = (style: Style) => {
      const Footer = Component(() => Div({ className: 'footer', ...style({ order: 9 }) }))
      const footer = Footer({ key: 'f' })
      const withHeader = () => Div({ ...slots(style, 1), children: [Span('h', { key: 'h', ...style({ '& ~ .footer': RED }) }), footer] })
      const bare = () => Div({ ...slots(style, 0), children: [footer] })
      return [render(withHeader, style, provider), render(bare, style, provider)]
    }
    expect(pages(compiledStyle)).toEqual(pages(runtimeStyle))
  })
})
