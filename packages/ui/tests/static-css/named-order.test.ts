// @vitest-environment jsdom
//
// Compiled nodes that carry their whole style's name, against Emotion as the
// oracle: each case renders one tree twice under a fresh cache, once with every
// node's css on the runtime path and once with the case's static nodes compiled
// to the name and text the runtime itself computes for their css. The two must
// give every element the same class and leave Emotion's sheet with the same
// rules in the same order, which is the same cascade for every tie.
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { serializeStyles } from '@emotion/serialize'
import { act, createElement, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Div, Node, Span, type NodeInstance } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { styledRenders } from './_styled-renders.js'
import { shaped } from './_render-shapes.js'

vi.mock('@src/components/styled-renderer.client.js', async original => (await import('./_styled-renders.js')).countingStyledRenderer(original as never))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Renders `make`'s element from a component, where an app's walk runs and reads its cache. */
const inRender = (make: () => ReactElement): ReactElement =>
  createElement(function Page() {
    return make()
  })

type Css = Record<string, unknown>

/** The name and text the runtime computes for `css`, which the compiler writes for it. */
function compile(css: Css): { name: string; styles: string } {
  const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const serialized = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  return { name: serialized.name, styles: serialized.styles }
}

/**
 * Props giving a node `css`: on the runtime path, or as the compiler emits a
 * static node, a carrier where it marks one: the first static node of a run that
 * a component or an end of the walk bounds on both sides.
 */
type Style = (css: Css, isStatic?: boolean, carrier?: boolean) => Record<string, unknown>
const runtimeStyle: Style = (css: Css) => ({ css })
const compiledStyle: Style = (css: Css, isStatic = true, carrier = false) => {
  if (!isStatic) return { css }
  const { name, styles } = compile(css)
  registerStaticCss(`m-${name}`, [[name, styles]])
  return { __meo$: 2, __meo$n: name, ...(carrier && { __meo$r: 1 }) }
}

/** What a case does with a render: one render, or several commits. */
type Steps = (render: (tree: (style: Style) => NodeInstance) => void) => void

let roots: Root[] = []

/** Runs a case with `style` under a fresh cache; returns the elements' classes and the sheet's rules. */
function runUnshaped(steps: Steps, style: Style): { classes: string[]; rules: string[] } {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  __resetStaticCss()
  const cache = createCache({ key: 'css', speedy: true })
  steps(tree => {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    act(() =>
      root.render(
        createElement(
          CacheProvider,
          { value: cache },
          inRender(() => tree(style).render() as ReactElement),
        ),
      ),
    )
  })
  const classes = [...document.body.querySelectorAll('[data-n]')].map(element => `${element.getAttribute('data-n')}: ${element.className}`)
  const rules = [...document.head.querySelectorAll<HTMLStyleElement>('style[data-emotion^="css"]')].flatMap(element =>
    [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText),
  )
  return { classes, rules }
}
const run = shaped(runUnshaped)

const once =
  (tree: (style: Style) => NodeInstance): Steps =>
  render =>
    render(tree)

const RED = { color: 'rgb(200, 0, 0)' }
const BLUE = { color: 'rgb(0, 0, 200)' }

const CASES: Record<string, Steps> = {
  'a parent’s & > * against its static child’s colour': once(style =>
    Div({ 'data-n': 'p', ...style({ '& > *': RED }, true, true), children: Span('c', { 'data-n': 'c', ...style(BLUE) }) }),
  ),
  'the same with the child’s colour under @media': once(style =>
    Div({ 'data-n': 'p', ...style({ '& > *': RED }, true, true), children: Span('c', { 'data-n': 'c', ...style({ '@media (min-width: 1px)': BLUE }) }) }),
  ),
  'a runtime parent’s & > * against a static child': once(style =>
    Div({ 'data-n': 'p', ...style({ '& > *': RED }, false), children: Span('c', { 'data-n': 'c', ...style(BLUE) }) }),
  ),
  'a static parent’s & > * against a runtime child': once(style =>
    Div({ 'data-n': 'p', ...style({ '& > *': RED }), children: Span('c', { 'data-n': 'c', ...style(BLUE, false) }) }),
  ),
  'a static :has(&) against a runtime ancestor': once(style =>
    Div({ 'data-n': 'a', className: 'x', ...style(RED, false), children: Span('d', { 'data-n': 'd', ...style({ '.x:has(&)': BLUE }) }) }),
  ),
  'a runtime grandparent and a static parent reaching one element': once(style =>
    Div({
      'data-n': 'g',
      ...style({ '& .t': RED }, false),
      children: Div({ 'data-n': 'p', ...style({ '& .t': BLUE }), children: Span('t', { 'data-n': 't', className: 't' }) }),
    }),
  ),
  'statics and runtimes interleaved among siblings': once(style =>
    Div({
      'data-n': 'r',
      children: [
        Div({ key: 1, 'data-n': '1', ...style({ order: 1 }) }),
        Div({ key: 2, 'data-n': '2', ...style({ order: 2 }, false) }),
        Div({ key: 3, 'data-n': '3', ...style({ order: 3 }) }),
        Div({ key: 4, 'data-n': '4', ...style({ order: 4 }) }),
        Div({ key: 5, 'data-n': '5', ...style({ order: 5 }, false), children: Div({ 'data-n': '6', ...style({ order: 6 }) }) }),
        Div({ key: 7, 'data-n': '7', ...style({ order: 7 }) }),
      ],
    }),
  ),
  'an identical node rendered earlier': render => {
    render(style => Div({ 'data-n': 'early', ...style(BLUE, true, true) }))
    render(style => Div({ 'data-n': 'p', ...style({ '& > *': RED }, true, true), children: Span('c', { 'data-n': 'c', ...style(BLUE) }) }))
  },
  'a parent mounted around a child an earlier commit inserted': render => {
    let wrap = () => {}
    render(style => {
      const App = () => {
        const [wrapped, setWrapped] = useState(false)
        wrap = () => setWrapped(true)
        // Each may be the first static node of the walk, so each is a carrier.
        const child = Span('c', { 'data-n': 'c', ...style(BLUE, true, true) })
        return (wrapped ? Div({ 'data-n': 'p', ...style({ '& > *': RED }, true, true), children: child }) : child).render() as ReactElement
      }
      return Node(App)
    })
    act(() => wrap())
  },
  'a parent’s & .child against a component child’s own .wrapper &, with carriers marked': once(style => {
    const Child = () => Span('c', { 'data-n': 'c', className: 'child', ...style({ '.wrapper &': BLUE }, true, true) }).render() as ReactElement
    return Div({ 'data-n': 'p', className: 'wrapper', ...style({ '& .child': RED }, true, true), children: Node(Child) })
  }),
  'a sibling’s & + .item against a component sibling’s own rule, with carriers marked': once(style => {
    const Item = () => Div({ 'data-n': 'i', className: 'item', ...style({ '.wrapper &': BLUE }, true, true) }).render() as ReactElement
    return Div({
      className: 'wrapper',
      children: [Span('s', { key: 's', 'data-n': 's', ...style({ '& + .item': RED }, true, true) }), Node(Item, { key: 'i' })],
    })
  }),
  'a component inside a nested array': once(style => {
    const Item = () => Div({ 'data-n': 'i', className: 'item', ...style({ '.wrapper &': BLUE }, true, true) }).render() as ReactElement
    return Div({
      className: 'wrapper',
      children: [
        Span('a', { key: 'a', ...style({ order: 1 }, true, true) }),
        [Span('s', { key: 's', 'data-n': 's', ...style({ '& + .item': RED }) }), Node(Item, { key: 'i' })],
      ],
    })
  }),
  'a generated list of components': once(style => {
    const Item = () => Div({ 'data-n': 'i', className: 'item', ...style({ '.wrapper &': BLUE }, true, true) }).render() as ReactElement
    return Div({
      'data-n': 'p',
      className: 'wrapper',
      ...style({ '& .item': RED }, true, true),
      __meo$list: true,
      children: ['a', 'b'].map(key => Node(Item, { key })),
    })
  }),
  'a component that renders a built element child': once(style => {
    const Item = () => Div({ 'data-n': 'i', className: 'item', ...style({ '.wrapper &': BLUE }, true, true) }).render() as ReactElement
    return Div({
      className: 'wrapper',
      children: [Span('s', { key: 's', 'data-n': 's', ...style({ '& + .item': RED }, true, true) }), createElement(Item, { key: 'i' })],
    })
  }),
  // A runtime node whose target is a component registers its class in the
  // browser; the component hands it to a static node, whose style takes it in.
  'a registered class handed to a static node': once(style => {
    const Box = (props: { className?: string }) => Div({ 'data-n': 'box', className: props.className, ...style(BLUE, true, true) }).render() as ReactElement
    return Div({ children: Node(Box, { ...style(RED, false), className: 'given' }) })
  }),
}

/**
 * Cases where a static node's rule and a component's own are in one run, and
 * the call site marks no carrier, as one the compiler did not compile: the walk
 * cuts at the component all the same and carries at the first node of each
 * stretch, so the run goes in ahead of the component's rules, where Emotion
 * puts it.
 */
const BEFORE_A_COMPONENT: Record<string, Steps> = {
  'a parent’s & .child against a component child’s own .wrapper &': once(style => {
    const Child = () => Span('c', { 'data-n': 'c', className: 'child', ...style({ '.wrapper &': BLUE }) }).render() as ReactElement
    return Div({ 'data-n': 'p', className: 'wrapper', ...style({ '& .child': RED }), children: Node(Child) })
  }),
  'a sibling’s & + .item against a component sibling’s own rule': once(style => {
    const Item = () => Div({ 'data-n': 'i', className: 'item', ...style({ '.wrapper &': BLUE }) }).render() as ReactElement
    return Div({ className: 'wrapper', children: [Span('s', { key: 's', 'data-n': 's', ...style({ '& + .item': RED }) }), Node(Item, { key: 'i' })] })
  }),
}

beforeEach(() => __resetStaticCss())
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  __resetStaticCss()
})

describe('compiled nodes carrying their style’s name go into Emotion’s sheet as their css would', () => {
  it.each(Object.entries(CASES))('%s', (_, steps) => {
    styledRenders()
    const expected = run(steps, runtimeStyle)
    const runtimeRenders = styledRenders()
    expect(expected.rules.length).toBeGreaterThan(0)
    expect(run(steps, compiledStyle)).toEqual(expected)
    // The compiled tree's named nodes took the named path, a carrier the
    // renderer its css would; none renders through more.
    expect(styledRenders()).toBeLessThanOrEqual(runtimeRenders)
  })
})

describe('before a component, with no carrier marked', () => {
  it.each(Object.entries(BEFORE_A_COMPONENT))('%s', (_, steps) => {
    const expected = run(steps, runtimeStyle)
    expect(run(steps, compiledStyle)).toEqual(expected)
  })
})

// A cache that prepends puts its rules at the start of the head, ahead of the
// page's own stylesheet, which then wins a tie. Compiled nodes go in through the
// same cache, so with no runtime rule on the page their rules go there too.
describe('under a cache that prepends, with the page’s stylesheet first in the head', () => {
  it('puts the compiled rules where it puts its own, ahead of the page’s', () => {
    const run = shaped((style: Style) => {
      document.head.innerHTML = '<style data-page>.card{padding:0}</style>'
      document.body.innerHTML = ''
      __resetStaticCss()
      const cache = createCache({ key: 'css', prepend: true })
      const root = createRoot(document.body.appendChild(document.createElement('div')))
      roots.push(root)
      act(() =>
        root.render(
          createElement(
            CacheProvider,
            { value: cache },
            inRender(() => Div({ className: 'card', ...style({ padding: 16 }, true, true) }).render() as ReactElement),
          ),
        ),
      )
      return [...document.head.querySelectorAll('style')].map(element => (element.hasAttribute('data-page') ? 'page' : (element.textContent ?? '')))
    })
    const expected = run(runtimeStyle)
    expect(expected.result.indexOf('page')).toBe(expected.result.length - 1)
    expect(run(compiledStyle)).toEqual(expected)
  })
})

// A generated list of keyed items, updated in place: an item that comes in
// between others brings styles not in yet, which the compiled tree inserts with
// the rule before it. React keeps each item by its key, so only the order of the
// rules can differ, and it must not.
describe('keyed items coming into a generated list on update', () => {
  /** Distinct values per item, so each item's rules are its own. */
  const shade = (id: string) => `rgb(${id.charCodeAt(0)}, 0, 0)`
  const item = (style: Style, id: string, runtime: 'own' | 'shared' | 'none') =>
    Div({
      key: id,
      'data-n': id,
      // An item may come first in the list, so its call site is a carrier.
      ...style({ order: id.charCodeAt(0) }, true, true),
      children: [
        Span('t', { 'data-n': `${id}t`, ...style({ '& + span': { color: shade(id) } }) }),
        ...(runtime === 'none' ? [] : [Span('r', { 'data-n': `${id}r`, ...style({ color: runtime === 'own' ? shade(id) : 'rgb(0, 9, 0)' }, false) })]),
      ],
    })
  const page = (style: Style, ids: string[], runtime: 'own' | 'shared' | 'none') =>
    Div({
      children: [
        Div({ key: 'list', __meo$list: true, children: ids.map(id => item(style, id, runtime)) } as never),
        // With no items, it would come first after the list.
        Span('after', { key: 'after', 'data-n': 'after', ...style({ order: ids.length }, true, true) }),
      ],
    })
  const SEQUENCE = [
    ['a', 'b'],
    ['a', 'c', 'b'],
    ['c', 'a', 'b', 'd'],
    ['d', 'b'],
    ['e', 'd', 'f', 'b'],
  ]

  /** Renders the sequence on one root under one cache; returns the classes and rules at each step. */
  const runUpdates = shaped((style: Style, runtime: 'own' | 'shared' | 'none') => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    __resetStaticCss()
    const cache = createCache({ key: 'css', speedy: true })
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    return SEQUENCE.map(ids => {
      act(() =>
        root.render(
          createElement(
            CacheProvider,
            { value: cache },
            inRender(() => page(style, ids, runtime).render() as ReactElement),
          ),
        ),
      )
      return {
        classes: [...document.body.querySelectorAll('[data-n]')].map(element => `${element.getAttribute('data-n')}: ${element.className}`),
        rules: [...document.head.querySelectorAll<HTMLStyleElement>('style[data-emotion^="css"]')].flatMap(element =>
          [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText),
        ),
      }
    })
  })

  it.each([
    ['each with a runtime child of its own', 'own'],
    ['each with a runtime child whose rule is in already', 'shared'],
    ['with no runtime child', 'none'],
  ] as const)('%s', (_, runtime) => {
    styledRenders()
    const expected = runUpdates(runtimeStyle, runtime)
    const runtimeRenders = styledRenders()
    expect(expected.result.at(-1)!.rules.length).toBeGreaterThan(0)
    expect(runUpdates(compiledStyle, runtime)).toEqual(expected)
    expect(styledRenders()).toBeLessThanOrEqual(runtimeRenders)
  })
})
