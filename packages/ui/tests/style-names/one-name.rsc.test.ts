// @vitest-environment node
//
// The store of classes compiled for components, shared across requests, when two
// different styles are given one name. MeoNode's names make that practically
// impossible, so the test names styles with Emotion's own hash instead, under
// which these two share a name.
//
// `react` is replaced with the client build minus `useState`, the shape of the
// `react-server` build, so these compiles take the RSC layer's path. Its `cache`
// memoizes until `newRequest()`, which stands in for a new request.
import { Fragment, type ReactElement } from 'react'
import murmur2 from '@emotion/hash'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
const { __setStyleHash } = await import('@src/util/style-name.util.js')

const newRequest = () => {
  request.values = new Map()
}

beforeEach(() => {
  newRequest()
  __clearSharedClassStore()
  __setStyleHash(murmur2)
})
afterEach(() => __setStyleHash())

type Element = ReactElement<{ children?: unknown; className?: string }>

const childrenOf = (element: Element) => {
  const children = element.props.children
  return (Array.isArray(children) ? children : [children]) as unknown[]
}
const ruleOf = (element: Element) => ((childrenOf(element).at(-1) as Element[])[0].props as { children: string }).children
const hostOf = (root: Element) => (root.type === Fragment ? childrenOf(root)[0] : root) as Element

/** Styles itself and passes on the className it is handed. */
function Card({ className, children }: { className?: string; children?: string }) {
  return Div({ className, color: 'rgb(0, 128, 128)', children }).render() as Element
}
const CardNode = createNode(Card)

describe('a class handed to a component, under a name kept for two different styles', () => {
  it('composes neither of them', () => {
    const handed = hostOf(CardNode({ css: SECOND, children: 'second' }).render() as Element).props.className as string
    newRequest()
    CardNode({ css: FIRST, children: 'first' }).render()
    newRequest()
    const card = Card({ className: handed, children: 'handed' })

    expect(ruleOf(card)).not.toContain('color:#02ab73')
    expect(ruleOf(card)).not.toContain('color:#031998')
    expect(card.props.className).toContain(handed)
  })
})
