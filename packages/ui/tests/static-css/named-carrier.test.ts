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
import { serializeStyles } from '@emotion/serialize'
import { act, Children, createElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button, Component, Div, Node, Span, type NodeInstance } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { shaped } from './_render-shapes.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Css = Record<string, unknown>

/** Props for a node of `css`: compiled to its name, and with `carrier` marked to carry what follows it. */
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

/** A component holding a count under its label, which a remount resets. */
function Counter({ label }: { label: string }) {
  const [count, setCount] = useState(0)
  return Button(`${label}:${count}`, { 'data-counter': label, onClick: () => setCount(value => value + 1) }).render() as ReactElement
}
const counter = (label: string, keyed: boolean) => Node(Counter, keyed ? { label, key: label } : { label })
const keyOf = (keyed: boolean, key: string) => (keyed ? { key } : {})

const RED = { color: 'rgb(200, 0, 0)' }
const BLUE = { color: 'rgb(0, 0, 200)' }
const GRID = { display: 'grid' }

/**
 * The toggle matrix: each case's page for whether its conditional or spread is
 * in. The compiled page marks the host, which begins its render, and the first
 * named node after each component that may render one.
 */
const CASES: Record<string, (on: boolean, style: Style, keyed: boolean) => NodeInstance> = {
  'a conditional static host, then a counter': (on, style, keyed) =>
    Div({ ...style(GRID, carrier), children: [on && Div({ ...keyOf(keyed, 's'), ...style(RED) }), counter('b', keyed)] }),
  'a conditional counter, then a counter': (on, style, keyed) => Div({ ...style(GRID, carrier), children: [on && counter('x', keyed), counter('b', keyed)] }),
  'a conditional counter, a static host, a counter': (on, style, keyed) =>
    Div({ ...style(GRID, carrier), children: [on && counter('x', keyed), Span('h', { ...keyOf(keyed, 'h'), ...style(BLUE, carrier) }), counter('b', keyed)] }),
  'a counter, a conditional static host, a counter': (on, style, keyed) =>
    Div({ ...style(GRID, carrier), children: [counter('x', keyed), on && Div({ ...keyOf(keyed, 's'), ...style(RED, carrier) }), counter('b', keyed)] }),
  'a counter, the spread, a counter': (on, style, keyed) =>
    Div({
      ...style(GRID, carrier),
      children: [counter('x', keyed), ...(on ? [Div({ ...keyOf(keyed, 's'), ...style(RED, carrier) }), counter('b', keyed)] : []), counter('y', keyed)],
    }),
  'a counter, a static host, the spread, a counter': (on, style, keyed) =>
    Div({
      ...style(GRID, carrier),
      children: [
        counter('x', keyed),
        Span('h', { ...keyOf(keyed, 'h'), ...style(BLUE, carrier) }),
        ...(on ? [counter('b', keyed), Div({ ...keyOf(keyed, 's'), ...style(RED, carrier) })] : []),
        counter('y', keyed),
      ],
    }),
  'a counter, then the spread at the end': (on, style, keyed) =>
    Div({
      ...style(GRID, carrier),
      children: [counter('x', keyed), ...(on ? [Div({ ...keyOf(keyed, 's'), ...style(RED, carrier) }), counter('b', keyed)] : [])],
    }),
  'a counter, a static host, then the spread at the end': (on, style, keyed) =>
    Div({
      ...style(GRID, carrier),
      children: [
        counter('x', keyed),
        Span('h', { ...keyOf(keyed, 'h'), ...style(BLUE, carrier) }),
        ...(on ? [Div({ ...keyOf(keyed, 's'), ...style(RED) }), counter('b', keyed)] : []),
      ],
    }),
  'the spread first, of the counter type, then a counter': (on, style, keyed) =>
    Div({
      ...style(GRID, carrier),
      children: [...(on ? [counter('b', keyed), Div({ ...keyOf(keyed, 's'), ...style(RED, carrier) })] : []), counter('y', keyed)],
    }),
}

/** What `.render()` gives a user to inspect: each child's kind and key, nested, as `Children` sees them. */
function shapeOf(node: ReactNode): unknown {
  if (!isValidElement(node)) return node === null || node === undefined || typeof node === 'boolean' ? String(node) : typeof node
  const children = (node.props as { children?: ReactNode }).children
  return {
    key: node.key,
    count: Children.count(children),
    isArray: Array.isArray(children),
    children: Children.map(children, child => (isValidElement(child) ? { key: child.key } : child === null ? 'null' : typeof child)) ?? null,
  }
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

const counters = () => [...document.querySelectorAll<HTMLButtonElement>('[data-counter]')].map(button => button.textContent)
const rules = () =>
  [...document.head.querySelectorAll<HTMLStyleElement>('style[data-emotion^="css"]')].flatMap(element =>
    [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText),
  )

/** Toggles the case four times from `initially`, counting each counter up after each step; returns what each step showed. */
function runUnshaped(page: (on: boolean) => NodeInstance, initially: boolean) {
  __resetStaticCss()
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  let toggle = () => {}
  const shapes: unknown[] = []
  function Page() {
    const [on, setOn] = useState(initially)
    toggle = () => setOn(value => !value)
    const element = page(on).render() as ReactElement
    shapes.push(shapeOf(element))
    return element
  }
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  root = createRoot(document.body.appendChild(document.createElement('div')))
  act(() => root!.render(createElement(CacheProvider, { value: createCache({ key: 'css', speedy: true }) }, createElement(Page))))
  const countUp = () => {
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-counter]')) act(() => button.click())
  }
  const steps = [{ counters: counters(), rules: rules() }]
  countUp()
  for (let i = 0; i < 4; i++) {
    act(() => toggle())
    steps.push({ counters: counters(), rules: rules() })
    countUp()
  }
  act(() => root!.unmount())
  root = undefined
  const keyWarnings = error.mock.calls.filter(call => /key/i.test(String(call[0]))).length
  error.mockRestore()
  return { steps, shapes, keyWarnings }
}
const run = shaped(runUnshaped)

/**
 * Whether the suite runs compiled. Compiled, a call site reports an unkeyed
 * spread's items itself, and React reports a missing key once per owner's name
 * in the process, so how many warnings a run sees depends on the runs before
 * it. The counts are pinned uncompiled; state, rules and shape in both modes.
 */
const COMPILED = process.env.MEONODE_COMPILED === '1'

describe.each([
  ['unkeyed', false],
  ['keyed', true],
] as const)('%s counters around a conditional or a spread, with carriers marked', (_, keyed) => {
  describe.each([
    ['with it in at first', true],
    ['with it out at first', false],
  ] as const)('%s', (__, initially) => {
    it.each(Object.entries(CASES))('%s', (___, page) => {
      const { keyWarnings, ...expected } = run(on => page(on, runtimeStyle, keyed), initially)
      if (!COMPILED) expect(keyWarnings).toBe(0)
      expect(expected.steps.at(-1)!.rules.length).toBeGreaterThan(0)
      const { keyWarnings: compiledWarnings, ...compiled } = run(on => page(on, compiledStyle, keyed), initially)
      if (!COMPILED) expect(compiledWarnings).toBe(keyWarnings)
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
  const shade = (id: string) => `rgb(${id.charCodeAt(0)}, 0, 0)`
  const page = (style: Style, ids: string[], keyed: boolean) =>
    Div({
      ...style(GRID, carrier),
      __meo$list: true,
      children: ids.map(id =>
        Div({
          ...keyOf(keyed, id),
          ...style({ order: id.charCodeAt(0) }, carrier),
          children: [Span('t', { ...keyOf(keyed, 't'), ...style({ '& + button': { color: shade(id) } }) }), counter(id, keyed)],
        }),
      ),
    } as never)
  const SEQUENCE = [
    ['a', 'b', 'c'],
    ['a', 'b', 'c', 'd'],
    ['b', 'c', 'd'],
    ['d', 'c', 'b'],
    ['e', 'd', 'c', 'b'],
  ]
  const runList = shaped((style: Style, keyed: boolean) => {
    __resetStaticCss()
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    let setIds: (ids: string[]) => void = () => {}
    const shapes: unknown[] = []
    // React reports a missing key once per parent's name, so each run's page has its own.
    const name = `Page${style === compiledStyle ? 'Compiled' : style === runtimeStyle ? 'Runtime' : 'Unmarked'}${keyed ? 'Keyed' : ''}`
    const Page = {
      [name]: function () {
        const [ids, set] = useState(SEQUENCE[0])
        setIds = set
        const element = page(style, ids, keyed).render() as ReactElement
        shapes.push(shapeOf(element))
        return element
      },
    }[name]
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    root = createRoot(document.body.appendChild(document.createElement('div')))
    act(() => root!.render(createElement(CacheProvider, { value: createCache({ key: 'css', speedy: true }) }, createElement(Page))))
    const steps = []
    for (const ids of SEQUENCE) {
      act(() => setIds(ids))
      steps.push({ counters: counters(), rules: rules() })
      for (const button of document.querySelectorAll<HTMLButtonElement>('[data-counter]')) act(() => button.click())
    }
    act(() => root!.unmount())
    root = undefined
    const keyWarnings = error.mock.calls.filter(call => /key/i.test(String(call[0]))).length
    error.mockRestore()
    return { steps, shapes, keyWarnings }
  })
  it.each([
    ['unkeyed', false],
    ['keyed', true],
  ] as const)('%s, through appends, removals and reorders, keeps state, rules and shape as uncompiled', (_, keyed) => {
    const { keyWarnings, ...expected } = runList(runtimeStyle, keyed)
    if (!COMPILED) expect(keyWarnings).toBe(keyed ? 0 : 1)
    expect(expected.steps.at(-1)!.rules.length).toBeGreaterThan(0)
    // React reports a missing key once per owner's name, `Styled` in both runs,
    // so the second run's count says nothing; what decides React's check, the
    // list arriving as one array with the same keys, is in the shapes compared.
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
