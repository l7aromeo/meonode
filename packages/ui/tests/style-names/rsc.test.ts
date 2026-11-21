// @vitest-environment node
//
// Two different styles compiled in the React Server Components layer, in one
// request and in requests one after another: each element's class must carry its
// own rule, and a class handed to a component must compose only its own styles.
//
// `react` is replaced with the client build minus `useState`, the shape of the
// `react-server` build, so these compiles take the RSC layer's path. Its `cache`
// memoizes until `newRequest()`, which stands in for a new request.
import { Fragment, type ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FIRST, SECOND } from '@tests/style-names/pair.js'

const request = vi.hoisted(() => ({ values: new Map<unknown, unknown>() }))

vi.mock('react', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>
  const { useState: _useState, ...serverBuild } = actual
  const cache = (fn: () => unknown) => () => {
    if (!request.values.has(fn)) request.values.set(fn, fn())
    return request.values.get(fn)
  }
  return { ...serverBuild, cache }
})

const { createNode, Div } = await import('@src/main.js')
const { __clearSharedClassStore } = await import('@src/util/server-emotion.util.js')

const newRequest = () => {
  request.values = new Map()
}

beforeEach(() => {
  newRequest()
  __clearSharedClassStore()
})

type Element = ReactElement<{ children?: unknown; className?: string }>

const childrenOf = (element: Element) => {
  const children = element.props.children
  return (Array.isArray(children) ? children : [children]) as unknown[]
}
/** The rule text the server layer renders beside an element. */
const ruleOf = (element: Element) => ((childrenOf(element).at(-1) as Element[])[0].props as { children: string }).children
/** The element a host node's render puts its class on. */
const hostOf = (root: Element) => (root.type === Fragment ? childrenOf(root)[0] : root) as Element

/** Styles itself and passes on the className it is handed. */
function Card({ className, children }: { className?: string; children?: string }) {
  return Div({ className, color: 'rgb(0, 128, 128)', children }).render() as Element
}
const CardNode = createNode(Card)

describe('two different styles in one server-component request', () => {
  it('give each element its own class, whose rule carries its own colour', () => {
    const first = Div({ css: FIRST, children: 'first' }).render() as Element
    const second = Div({ css: SECOND, children: 'second' }).render() as Element

    expect(hostOf(first).props.className).not.toBe(hostOf(second).props.className)
    expect(ruleOf(second)).toContain('color:#031998')
  })
})

describe('a class handed to a component in a later request', () => {
  it('composes only its own styles, not those of a different style compiled earlier for a component', () => {
    const handed = hostOf(Div({ css: SECOND, children: 'second' }).render() as Element).props.className as string
    newRequest()
    CardNode({ css: FIRST, children: 'first' }).render()
    newRequest()
    const card = Card({ className: handed, children: 'handed' })

    expect(ruleOf(card)).not.toContain('color:#02ab73')
  })
})
