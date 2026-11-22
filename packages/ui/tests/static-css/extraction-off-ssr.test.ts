// @vitest-environment node
//
// A render with no compiled styles registered takes the runtime path only:
// each styled node's rule goes out in place, before its element, as Emotion
// writes it. The snapshots were taken before compiled nodes could hand their
// rules to a runtime node's insertion, so they hold the output that path must
// leave as it was.
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Div, Node, Span, type NodeInstance } from '@src/main.js'

const RED = { color: 'rgb(200, 0, 0)' }
const BLUE = { color: 'rgb(0, 0, 200)' }

const CASES: Record<string, () => NodeInstance> = {
  'nested styled hosts': () => Div({ css: { '& > *': RED }, children: Span('c', { css: BLUE }) }),
  'styled siblings around an unstyled one': () =>
    Div({ children: [Div({ key: 1, css: { order: 1 } }), Div({ key: 2 }), Div({ key: 3, css: { order: 3 }, children: Span('t', { css: RED }) })] }),
  'a component handed a styled node’s class': () => {
    const Box = (props: { className?: string }) => Div({ className: props.className, css: BLUE }).render() as ReactElement
    return Div({ children: Node(Box, { css: RED, className: 'given' }) })
  },
}

describe.each([
  ['with no cache provider', false],
  ['under a cache provider', true],
])('a server render with nothing compiled, %s', (_, provider) => {
  it.each(Object.entries(CASES))('%s', (_, tree) => {
    const element = tree().render() as ReactElement
    expect(renderToString(provider ? createElement(CacheProvider, { value: createCache({ key: 'css' }) }, element) : element)).toMatchSnapshot()
  })
})
