// @vitest-environment node
//
// Joined calls of an imported factory (`__meoFactoryCall`) rendered on the
// server, against the same calls uncompiled, with and without a cache provider
// and under a component the walk stops at. A joined call is a named node, whose
// rule goes in with the rule of the runtime node before it, so the elements
// and their classes must match, and the rules must reach the page in the same
// order, a rule written again counted again.
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { __meoFactoryCall, createChildrenFirstNode, createNode, Div, Node, type NodeInstance } from '@src/main.js'
import { STATIC_NAME_MARKER } from '@src/constant/common.const.js'
import { __resetStaticCss } from '@src/util/static-css.util.js'

type Props = Record<string, unknown>

const Panel = createNode('section', { padding: 8, css: { color: 'rgb(200, 0, 0)', '&:hover': { color: 'rgb(0, 0, 200)' } } } as never) as unknown as (
  props?: Props,
) => NodeInstance
const Label = createChildrenFirstNode('span', { fontWeight: 700 } as never) as unknown as (children?: unknown, props?: Props) => NodeInstance

/** The two ways a page calls the factories: joined, as compiled output does, or as written. */
interface Calls {
  panel: (props: Props) => NodeInstance
  label: (children: unknown, props: Props) => NodeInstance
}
const sites = { panel: { at: 0 }, label: { at: 1 } }
const joined: Calls = {
  panel: props => {
    const node = __meoFactoryCall(Panel, sites.panel, props) as NodeInstance
    expect((node.props as Props)[STATIC_NAME_MARKER]).toBeDefined()
    return node
  },
  label: (children, props) => __meoFactoryCall(Label, sites.label, children, props) as NodeInstance,
}
const plain: Calls = { panel: props => Panel(props), label: (children, props) => Label(children, props) }

/** A component the walk stops at, rendering a call of its own. */
function Inner({ calls }: { calls: Calls }) {
  return calls.panel({ padding: 4, children: 'inner' }).render() as ReactElement
}

/** A page mixing runtime nodes, joined calls and a component. */
const page = (calls: Calls) =>
  createElement(function Page() {
    return Div({
      children: [
        Div({ key: 'r', css: { order: 1 } }),
        calls.panel({ key: 'a', padding: 4, children: [calls.label('one', { key: 'l', color: 'rgb(0, 200, 0)' })] }),
        Node(Inner, { key: 'i', calls }),
        calls.panel({ key: 'b', padding: 4, children: 'two' }),
        Div({ key: 's', css: { order: 2 } }),
      ],
    }).render() as ReactElement
  })

const STYLE_ELEMENT = /<style data-emotion="([^"]*)"[^>]*>(.*?)<\/style>/g

/** The page's markup without its style elements, and the rules they hold, in order. */
function read(html: string): { markup: string; rules: string[] } {
  const rules: string[] = []
  for (const [, , text] of html.matchAll(STYLE_ELEMENT)) {
    for (const rule of text.split(/(?<=\})(?=[.@])/)) if (rule) rules.push(rule)
  }
  return { markup: html.replace(STYLE_ELEMENT, ''), rules }
}

beforeEach(() => {
  __resetStaticCss()
})

describe('joined calls on the server', () => {
  it('render the page the calls uncompiled render, with no cache provider', () => {
    expect(read(renderToString(page(joined)))).toEqual(read(renderToString(page(plain))))
  })

  it('render the page the calls uncompiled render, under a cache provider', () => {
    const under = (calls: Calls) => createElement(CacheProvider, { value: createCache({ key: 'app' }) }, page(calls))
    expect(read(renderToString(under(joined)))).toEqual(read(renderToString(under(plain))))
  })
})
