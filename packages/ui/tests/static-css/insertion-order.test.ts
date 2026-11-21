// @vitest-environment jsdom
//
// When and in what order the browser inserts extracted rules: when a node using
// them first renders, in the order Emotion's insertion effects would run for the
// same nodes uncompiled, deepest first, and a render nested in another before it.
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Div, Node } from '@src/main.js'
import { __resetStaticCss, __setStaticCssSpeedy, registerStaticCss } from '@src/util/static-css.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const names = ['outer', 'middle', 'inner', 'nested', 'unused'] as const
const classOf = (name: (typeof names)[number]) => `mn-0000000${name.padEnd(6, '0')}`

let roots: Root[] = []

function mount(element: ReactElement) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

/** The base bucket's rules, as the classes they define, in sheet order. */
const inserted = () =>
  [...(document.head.querySelector<HTMLStyleElement>('style[data-meonode-static="0"]')?.sheet?.cssRules ?? [])].map(
    rule => names.find(name => rule.cssText.includes(classOf(name))) ?? rule.cssText,
  )

const node = (name: (typeof names)[number], children?: unknown) => Div({ __meo$: 2, __meo$s: classOf(name), children } as never)

beforeEach(() => {
  __resetStaticCss()
  __setStaticCssSpeedy(true)
  document.head.innerHTML = ''
  registerStaticCss(
    'order',
    names.map(name => [0, classOf(name), `.${classOf(name)}{order:${names.indexOf(name)};}`] as const),
  )
})
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  document.body.innerHTML = ''
  __setStaticCssSpeedy()
})

describe('in the browser', () => {
  it('inserts a render’s classes deepest first, as Emotion’s insertion effects run', () => {
    mount(node('outer', node('middle', node('inner'))).render() as ReactElement)
    expect(inserted()).toEqual(['inner', 'middle', 'outer'])
  })

  it('inserts a render nested in another before it', () => {
    const Nested = () => node('nested').render() as ReactElement
    mount(node('outer', Node(Nested)).render() as ReactElement)
    expect(inserted()).toEqual(['nested', 'outer'])
  })

  it('inserts nothing for a class no rendered node uses', () => {
    mount(node('outer').render() as ReactElement)
    expect(inserted()).toEqual(['outer'])
  })

  it('inserts a class once, where it first rendered', () => {
    mount(node('inner').render() as ReactElement)
    mount(node('outer', node('inner')).render() as ReactElement)
    expect(inserted()).toEqual(['inner', 'outer'])
  })
})
