// @vitest-environment jsdom
//
// Carriers: a named node the compiler marks renders through `StyledRenderer`,
// as a runtime node does, and inserts the named styles that begin after it
// with its own rule. With them nothing is added to a host's children, so
// `.render()` returns the children as written, the same count and keys as the
// tree with every node's css on the runtime path, while the sheet's rules
// come out in the same order and components keep their state.
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { act, createElement, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Component, Div, Node, Span, type NodeInstance } from '@src/main.js'
import { __resetStaticCss } from '@src/util/static-css.util.js'
import { shaped } from './_render-shapes.js'
import {
  BLUE,
  carrier,
  CASES,
  compiledStyle,
  Counter,
  GRID,
  RED,
  rules,
  run,
  runList,
  runtimeStyle,
  shapeOf,
  unmountCarrierRoot,
  type Style,
} from './_carrier-pages.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
beforeEach(() => {
  __resetStaticCss()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = undefined
  unmountCarrierRoot()
  __resetStaticCss()
  vi.restoreAllMocks()
})

describe.each([
  ['unkeyed', false],
  ['keyed', true],
] as const)('%s counters around a conditional or a spread, with carriers marked', (_, keyed) => {
  describe.each([
    ['with it in at first', true],
    ['with it out at first', false],
  ] as const)('%s', (__, initially) => {
    it.each(Object.entries(CASES))('%s', (___, page) => {
      // The key warnings each run gives are counted in carrier-keys, a file each.
      const { keyWarnings: _runtimeWarnings, ...expected } = run(on => page(on, runtimeStyle, keyed), initially)
      expect(expected.steps.at(-1)!.rules.length).toBeGreaterThan(0)
      const { keyWarnings: _compiledWarnings, ...compiled } = run(on => page(on, compiledStyle, keyed), initially)
      // The same state and rules, and `.render()` the same children.
      expect(compiled).toEqual(expected)
    })
  })
})

/** Renders `tree` once under a fresh cache; returns the classes, the rules and the shape `.render()` gave. */
function onceUnshaped(tree: (style: Style) => NodeInstance, style: Style) {
  __resetStaticCss()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  let shape: unknown
  root = createRoot(document.body.appendChild(document.createElement('div')))
  act(() =>
    root!.render(
      createElement(
        CacheProvider,
        { value: createCache({ key: 'css', speedy: true }) },
        createElement(function Page() {
          const element = tree(style).render() as ReactElement
          shape = shapeOf(element)
          return element
        }),
      ),
    ),
  )
  const classes = [...document.body.querySelectorAll('[data-n]')].map(element => `${element.getAttribute('data-n')}: ${element.className}`)
  const result = { classes, rules: rules(), shape }
  act(() => root!.unmount())
  root = undefined
  return result
}
const once = shaped(onceUnshaped)

const TIES: Record<string, (style: Style) => NodeInstance> = {
  // A component after a spread, which the walk cuts at as at any component. The
  // static node after it begins a run the compiler marks as a carrier, since its
  // pass cuts at the component; so it inserts its rule from its own render, after
  // the component's, and the tie goes to it as uncompiled.
  'a static node after a component after a spread, against the component’s own rule': style => {
    const Item = Component(() => Div({ 'data-n': 'i', className: 'item', ...style({ '.wrapper:has(.t) &': BLUE }, carrier) }))
    return Div({
      className: 'wrapper',
      children: [
        ...[1, 2].map(n => Span(String(n), { key: `n${n}` })),
        Div({ key: 'r', 'data-n': 'r', ...style({ order: 1 }, { runtime: true }) }),
        Item({ key: 'i' }),
        Span('t', { key: 't', 'data-n': 't', className: 't', ...style({ '.wrapper:has(&) .item': RED }, carrier) }),
      ],
    })
  },
  // A `Component(...)` is a component like any other: the first named node of
  // a stretch it ends is a carrier, as the compiler marks it.
  'a sibling’s & + .item against a Component sibling’s own rule': style => {
    const Item = Component(() => Div({ 'data-n': 'i', className: 'item', ...style({ '.wrapper &': BLUE }, carrier) }))
    return Div({
      className: 'wrapper',
      children: [Span('s', { key: 's', 'data-n': 's', ...style({ '& + .item': RED }, carrier) }), Item({ key: 'i' })],
    })
  },
  'a static parent’s & .child against a Component child’s own .wrapper &': style => {
    const Child = Component(() => Span('c', { 'data-n': 'c', className: 'child', ...style({ '.wrapper &': BLUE }, carrier) }))
    return Div({ 'data-n': 'p', className: 'wrapper', ...style({ '& .child': RED }, carrier), children: Child() })
  },
  'Components between statics, written with Node': style => {
    const Item = Component(() => Div({ 'data-n': 'i', className: 'item', ...style({ order: 7 }, carrier) }))
    return Div({
      ...style(GRID, carrier),
      children: [
        Span('a', { key: 'a', 'data-n': 'a', ...style({ '& ~ .item': RED }) }),
        Node(Item, { key: 'i' }),
        Span('b', { key: 'b', 'data-n': 'b', ...style(BLUE, carrier) }),
        Node(Item, { key: 'j' }),
      ],
    })
  },
  'a parent’s & .child against a component child’s own .wrapper &': style => {
    const Child = () => Span('c', { 'data-n': 'c', className: 'child', ...style({ '.wrapper &': BLUE }, carrier) }).render() as ReactElement
    return Div({ 'data-n': 'p', className: 'wrapper', ...style({ '& .child': RED }, carrier), children: Node(Child) })
  },
  'a sibling’s & + .item against a component sibling’s own rule': style => {
    const Item = () => Div({ 'data-n': 'i', className: 'item', ...style({ '.wrapper &': BLUE }, carrier) }).render() as ReactElement
    return Div({ className: 'wrapper', children: [Span('s', { key: 's', 'data-n': 's', ...style({ '& + .item': RED }, carrier) }), Node(Item, { key: 'i' })] })
  },
  'statics after a runtime node, before a component': style => {
    const Item = () => Div({ 'data-n': 'i', className: 'item', ...style({ '.wrapper &': BLUE }, carrier) }).render() as ReactElement
    return Div({
      className: 'wrapper',
      children: [
        Span('r', { key: 'r', 'data-n': 'r', ...style({ order: 1 }, { runtime: true }) }),
        Span('s', { key: 's', 'data-n': 's', ...style({ '& + .item': RED }) }),
        Node(Item, { key: 'i' }),
      ],
    })
  },
  'a whole static tree, no runtime node and no component': style =>
    Div({
      'data-n': 'p',
      ...style({ '& > *': RED }, carrier),
      children: [Span('a', { key: 'a', 'data-n': 'a', ...style(BLUE) }), Span('b', { key: 'b', 'data-n': 'b', ...style({ order: 2 }) })],
    }),
  'statics after the last component, at the end': style => {
    const Item = () => Div({ 'data-n': 'i', className: 'item', ...style({ order: 3 }, carrier) }).render() as ReactElement
    return Div({
      className: 'wrapper',
      ...style(GRID, carrier),
      children: [
        Node(Item, { key: 'i' }),
        Span('t', { key: 't', 'data-n': 't', ...style({ '.item + &': RED }, carrier) }),
        Span('u', { key: 'u', ...style(BLUE) }),
      ],
    })
  },
}

describe('ties with carriers marked', () => {
  it.each(Object.entries(TIES))('%s', (_, tree) => {
    const expected = once(tree, runtimeStyle)
    expect(expected.rules.length).toBeGreaterThan(0)
    expect(once(tree, compiledStyle)).toEqual(expected)
  })
})

// A generated list whose items each hold a component: every named item may
// follow a component, so each is a carrier, and the run that begins in an item
// goes in with the item's own rule. The list reaches React as written, so
// unkeyed items pair by index as they do uncompiled.
describe('a generated list of items each holding a component', () => {
  it.each([
    ['unkeyed', false],
    ['keyed', true],
  ] as const)('%s, through appends, removals and reorders, keeps state, rules and shape as uncompiled', (_, keyed) => {
    // The key warnings each run gives are counted in carrier-keys, a file each.
    const { keyWarnings: _runtimeWarnings, ...expected } = runList(runtimeStyle, keyed)
    expect(expected.steps.at(-1)!.rules.length).toBeGreaterThan(0)
    // What decides React's key check, the list arriving as one array with the
    // same keys, is in the shapes compared.
    const { keyWarnings: _compiledWarnings, ...compiled } = runList(compiledStyle, keyed)
    expect(compiled).toEqual(expected)
  })

  // Pinned: with no carrier marked, the walk carries at whichever item begins
  // its stretch, which a reorder changes, so an item flips between its host and
  // a renderer and React remounts it. That is why the compiler marks every item
  // that may begin one.
  it('remount keyed items no carrier marks, once the list reorders', () => {
    const unmarkedStyle: Style = (css, options) => compiledStyle(css, { ...options, carrier: false })
    const expected = runList(runtimeStyle, true)
    const unmarked = runList(unmarkedStyle, true)
    expect(expected.steps.map(step => step.counters)).toEqual([
      ['a:0', 'b:0', 'c:0'],
      ['a:1', 'b:1', 'c:1', 'd:0'],
      ['b:2', 'c:2', 'd:1'],
      ['d:2', 'c:3', 'b:3'],
      ['e:0', 'd:3', 'c:4', 'b:4'],
    ])
    // An item remounts each time it comes to begin the list or stops beginning it.
    expect(unmarked.steps.map(step => step.counters)).toEqual([
      ['a:0', 'b:0', 'c:0'],
      ['a:1', 'b:1', 'c:1', 'd:0'],
      ['b:0', 'c:2', 'd:1'],
      ['d:0', 'c:3', 'b:0'],
      ['e:0', 'd:0', 'c:4', 'b:1'],
    ])
  })
})

// A Component after a named sibling, whose run goes in with the rule before it.
describe('a Component after a named sibling', () => {
  it('keeps every render under StrictMode at the runtime twin’s rules', async () => {
    const { StrictMode } = await import('react')
    const runOnce = shaped((style: Style) => {
      __resetStaticCss()
      document.head.innerHTML = ''
      const Item = Component(() => Div({ className: 'item', ...style({ '.wrapper &': BLUE }, carrier) }))
      const container = document.body.appendChild(document.createElement('div'))
      const strictRoot = createRoot(container)
      act(() =>
        strictRoot.render(
          createElement(
            StrictMode,
            null,
            createElement(
              CacheProvider,
              { value: createCache({ key: 'css', speedy: true }) },
              createElement(function Page() {
                return Div({
                  className: 'wrapper',
                  children: [Span('s', { key: 's', ...style({ '& + .item': RED }, carrier) }), Item({ key: 'i' })],
                }).render() as ReactElement
              }),
            ),
          ),
        ),
      )
      const result = rules()
      act(() => strictRoot.unmount())
      container.remove()
      return result
    })
    const expected = runOnce(runtimeStyle)
    expect(expected.result.length).toBeGreaterThan(0)
    expect(runOnce(compiledStyle)).toEqual(expected)
  })
})

describe('a Component element written twice in one host', () => {
  // Each instance's rules follow the run before it, as uncompiled.
  it.each([
    ['', false],
    [' under StrictMode', true],
  ])('keeps each instance’s rules after the run before it%s', async (_, strict) => {
    const { StrictMode } = await import('react')
    const runOnce = shaped((style: Style) => {
      __resetStaticCss()
      document.head.innerHTML = ''
      const Item = Component(() => Div({ className: 'item', ...style({ order: 9 }, carrier) }))
      const item = Item()
      const container = document.body.appendChild(document.createElement('div'))
      const twiceRoot = createRoot(container)
      const page = createElement(
        CacheProvider,
        { value: createCache({ key: 'css', speedy: true }) },
        createElement(function Page() {
          return Div({
            children: [Span('a', { key: 'a', ...style({ order: 1 }, carrier) }), item, Span('b', { key: 'b', ...style({ order: 2 }, carrier) }), item],
          }).render() as ReactElement
        }),
      )
      act(() => twiceRoot.render(strict ? createElement(StrictMode, null, page) : page))
      const result = rules()
      act(() => twiceRoot.unmount())
      container.remove()
      return result
    })
    const expected = runOnce(runtimeStyle)
    expect(expected.result.length).toBe(3)
    expect(runOnce(compiledStyle)).toEqual(expected)
  })
})

// Props that mark no carrier, which no compiler marking carriers emits: the
// rules still go in as uncompiled, through a `StaticStyles` the walk adds to the
// children, so what `.render()` returns differs, and development says so.
// Input the compiler did not mark: the walk carries a run at the first named
// node with no rule before it, as the compiler marks one, so the tree, its
// rules and every `.render()` are the runtime twin's, with nothing reported.
describe('named nodes with no carrier marked', () => {
  // The tie row of a component after a spread, with the static node after it
  // left unmarked: the walk cuts at the component the compiler could not see,
  // and the static node after it carries, after the component's rule.
  it('keep a run after a component the compiler could not see, after its rule', () => {
    const tree = TIES['a static node after a component after a spread, against the component’s own rule']
    const unmarked: Style = (css, options) => compiledStyle(css, options?.carrier && css['.wrapper:has(&) .item'] ? {} : options)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const expected = once(tree, runtimeStyle)
    const compiled = once(tree, unmarked)
    const reports = errors.mock.calls.filter(call => String(call[0]).includes('have no carrier')).length
    errors.mockRestore()
    expect(compiled).toEqual(expected)
    expect(reports).toBe(0)
  })

  it('keep the runtime twin’s tree and rules before a component', () => {
    const tree = (style: Style) =>
      Div({
        'data-n': 'p',
        ...style({ '& > *': RED }),
        children: [Span('c', { key: 'c', 'data-n': 'c', ...style(BLUE) }), Node(Counter, { key: 'k', label: 'k' })],
      })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const expected = once(tree, runtimeStyle)
    const compiled = once(tree, compiledStyle)
    const reports = errors.mock.calls.filter(call => String(call[0]).includes('have no carrier')).length
    errors.mockRestore()
    expect(expected.renders[0]).toEqual({ key: null, children: [{ key: 'c', children: 'string' }, { key: 'k' }] })
    expect(compiled).toEqual(expected)
    expect(reports).toBe(0)
  })

  it('return the twin’s tree on every render', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const twice = shaped((style: Style) => {
      __resetStaticCss()
      document.head.innerHTML = ''
      let bump = () => {}
      function Page() {
        const [count, setCount] = useState(0)
        bump = () => setCount(value => value + 1)
        return Div({ 'data-count': count, ...style({ '& > *': RED }), children: Span('c', style(BLUE)) }).render() as ReactElement
      }
      root = createRoot(document.body.appendChild(document.createElement('div')))
      act(() => root!.render(createElement(CacheProvider, { value: createCache({ key: 'css', speedy: true }) }, createElement(Page))))
      act(() => bump())
      const result = { rules: rules() }
      act(() => root!.unmount())
      root = undefined
      return result
    })
    const expected = twice(runtimeStyle)
    const compiled = twice(compiledStyle)
    errors.mockRestore()
    const tree = { key: null, children: { key: null, children: 'string' } }
    expect(expected.renders).toEqual([tree, tree])
    expect(compiled).toEqual(expected)
  })
})
