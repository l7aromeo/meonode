// @vitest-environment jsdom
//
// A slot before a component among a compiled host's children marks where a
// run of named styles must be in by: a carrier before it, or the last runtime
// node, inserts the run with its own rule, so nothing is added to the children.
// So a child keeps its position, and its state, when a conditional elsewhere
// among the children brings a static node in and out; and React asks for no
// key the authored children would not need.
import { serializeStyles } from '@emotion/serialize'
import { act, createElement, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button, Div, Node, Span } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Renders `make`'s element from a component, where an app's walk runs and reads its cache. */
const inRender = (make: () => ReactElement): ReactElement =>
  createElement(function Page() {
    return make()
  })

/** Props for a static node of `css`, as the compiler emits them. */
function staticStyle(css: Record<string, unknown>): Record<string, unknown> {
  const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const { name, styles } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  registerStaticCss(`m-${name}`, [[name, styles]])
  return { __meo$: 2, __meo$n: name }
}

let root: Root | undefined
beforeEach(() => {
  __resetStaticCss()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = undefined
  __resetStaticCss()
  vi.restoreAllMocks()
})

/** A component holding a count, which a remount would reset. */
function Counter() {
  const [count, setCount] = useState(0)
  return Button(String(count), { 'data-n': 'counter', onClick: () => setCount(value => value + 1) }).render() as ReactElement
}

describe('a slot before a component', () => {
  it('keeps the component’s state while a conditional static node before it, its carrier, comes and goes', () => {
    let toggle = () => {}
    function Page() {
      const [shown, setShown] = useState(true)
      toggle = () => setShown(value => !value)
      return Div({ __meo$: 2, __meo$p: [1], children: [shown && Div({ ...staticStyle({ order: 1 }), __meo$r: 1 }), Node(Counter)] }).render() as ReactElement
    }
    root = createRoot(document.body.appendChild(document.createElement('div')))
    act(() => root!.render(createElement(Page)))
    const counter = () => document.querySelector<HTMLButtonElement>('[data-n="counter"]')!
    const first = counter()
    act(() => first.click())
    act(() => first.click())
    expect(counter().textContent).toBe('2')

    act(() => toggle())
    act(() => toggle())
    act(() => toggle())
    expect(counter()).toBe(first)
    expect(counter().textContent).toBe('2')
  })

  it('keeps a generated list one key-checked list with a slot before it as a whole', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Item = () => Span('i', staticStyle({ order: 5 })).render() as ReactElement
    const page = (keyed: boolean) =>
      Div({
        __meo$: 2,
        __meo$p: [[]],
        __meo$list: true,
        ...staticStyle({ order: 4 }),
        children: ['a', 'b'].map(key => (keyed ? Node(Item, { key }) : Node(Item))),
      })
    root = createRoot(document.body.appendChild(document.createElement('div')))
    act(() => root!.render(inRender(() => page(true).render() as ReactElement)))
    expect(error.mock.calls.map(call => String(call[0])).filter(message => /key/i.test(message))).toEqual([])
    act(() => root!.render(inRender(() => page(false).render() as ReactElement)))
    // Unkeyed, React still asks for keys: the list reaches it as one list.
    expect(error.mock.calls.map(call => String(call[0])).some(message => /key/i.test(message))).toBe(true)
    expect(document.body.querySelectorAll('span').length).toBe(2)
  })

  it('asks for no key the authored children do not need', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Item = () => Span('i', staticStyle({ order: 2 })).render() as ReactElement
    const page = Div({
      __meo$: 2,
      __meo$p: [1, [2, 1]],
      children: [Div(staticStyle({ order: 1 })), Node(Item), [Span('a', { key: 'a', ...staticStyle({ order: 3 }) }), Node(Item, { key: 'b' })]],
    })
    root = createRoot(document.body.appendChild(document.createElement('div')))
    act(() => root!.render(inRender(() => page.render() as ReactElement)))
    expect(error.mock.calls.map(call => String(call[0])).filter(message => /key/i.test(message))).toEqual([])
    expect(document.body.querySelectorAll('span').length).toBe(3)
  })
})
