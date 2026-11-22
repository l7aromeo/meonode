// @vitest-environment node
//
// Compiled named nodes on the server under StyleRegistry, against the same tree
// with every node's css on the runtime path. The registry's cache collects each
// rule instead of writing it in place, and its flush writes them in the order
// they went in. A named node's rule goes in with its run, at the rule of the
// runtime node it follows or at its carrier, so the flush must list the same
// rules in the same order, and the elements must have the same classes.
import { serializeStyles } from '@emotion/serialize'
import { ServerInsertedHTMLContext } from 'next/navigation.js'
import { createElement, Fragment, type ReactElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import StyleRegistry from '@src/components/style-registry.client.js'
import { Div, Node, Span, type NodeInstance } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'

type Css = Record<string, unknown>
/** Props giving a node `css`: on the runtime path, or named as the compiler emits it, a carrier where it marks one. */
type Style = (css: Css, isStatic?: boolean, carrier?: boolean) => Record<string, unknown>
const runtimeStyle: Style = css => ({ css })
const compiledStyle: Style = (css, isStatic = true, carrier = false) => {
  if (!isStatic) return { css }
  const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const { name, styles } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  registerStaticCss(`m-${name}`, [[name, styles]])
  return { __meo$: 2, __meo$n: name, ...(carrier && { __meo$r: 1 }) }
}

const RED = { color: 'rgb(200, 0, 0)' }
const BLUE = { color: 'rgb(0, 0, 200)' }

/** Server-renders `tree` under StyleRegistry: the rules its flush writes, in order, and the body without style elements. */
function render(tree: (style: Style) => NodeInstance, style: Style): { rules: string[]; body: string } {
  __resetStaticCss()
  const callbacks: (() => ReactNode)[] = []
  const page = createElement(function Page() {
    return tree(style).render() as ReactElement
  })
  const body = renderToString(
    createElement(ServerInsertedHTMLContext.Provider, { value: callback => callbacks.push(callback) }, createElement(StyleRegistry, null, page)),
  )
  const flushed = renderToString(createElement(Fragment, null, ...callbacks.map(callback => callback())))
  const rules: string[] = []
  for (const [, text] of flushed.matchAll(/<style[^>]*data-emotion="meonode-css[^"]*"[^>]*>(.*?)<\/style>/gs))
    for (const rule of text.split(/(?<=\})(?=[.@])/)) if (rule) rules.push(rule)
  return { rules, body: body.replace(/<style[^>]*>.*?<\/style>/gs, '') }
}

const CASES: Record<string, (style: Style) => NodeInstance> = {
  // The parent's rule ties with the child's own: the order they go in decides the colour.
  'a parent’s & > * against its static child’s colour': style => Div({ ...style({ '& > *': RED }, true, true), children: Span('c', style(BLUE)) }),
  'static nodes after a runtime node, then another runtime node': style =>
    Div({
      children: [
        Div({ key: 1, ...style({ order: 1 }, false) }),
        Div({ key: 2, ...style({ '& ~ *': RED }) }),
        Div({ key: 3, ...style(BLUE) }),
        Div({ key: 4, ...style({ order: 4 }, false) }),
      ],
    }),
  'a static node after a component, carrying what follows it': style => {
    const Card = () => Span('k', style({ order: 9 }, false)).render() as ReactElement
    return Div({
      children: [Node(Card, { key: 'k' }), Div({ key: 'a', ...style({ '& + *': RED }, true, true) }), Div({ key: 'b', ...style(BLUE) })],
    })
  },
  // Inserted out of alphabetical order, so a sorted flush would put them back in the wrong one.
  'names that sort against their render order': style =>
    Div({ children: ['z', 'm', 'a'].map((letter, index) => Span(letter, { key: letter, ...style({ order: index, '--l': letter }, true, index === 0) })) }),
}

afterEach(() => __resetStaticCss())

describe('compiled named nodes under StyleRegistry, on the server', () => {
  it.each(Object.entries(CASES))('%s', (_, tree) => {
    const expected = render(tree, runtimeStyle)
    expect(expected.rules.length).toBeGreaterThan(0)
    expect(render(tree, compiledStyle)).toEqual(expected)
  })
})
