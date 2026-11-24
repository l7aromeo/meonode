// @vitest-environment jsdom
//
// What a render with named styles costs in fibers in the browser: a renderer
// for each node that carries a run, and nothing else.
import { act, createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { serializeStyles } from '@emotion/serialize'
import { Component, Div, Node, Span, type NodeInstance } from '@src/main.js'
import { STATIC_CARRIER_MARKER } from '@src/constant/common.const.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CHILDREN = 10

/** A fiber's kind: `host:<tag>` for an element, else its component's name, else React's tag. */
function kindOf(fiber: { type: unknown; tag: number }): string {
  if (typeof fiber.type === 'string') return `host:${fiber.type}`
  const type = fiber.type as { displayName?: string; name?: string } | null
  return type?.displayName || type?.name || `tag ${fiber.tag}`
}

/** Mounts `tree`, renders it again, and counts the committed tree's fibers by kind each time. */
function census(tree: () => ReactElement): { mount: Record<string, number>; again: Record<string, number> } {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  const count = () => {
    const key = Object.keys(container).find(name => name.startsWith('__reactContainer$'))!
    const kinds: Record<string, number> = {}
    const visit = (fiber: { type: unknown; tag: number; child: unknown; sibling: unknown } | null) => {
      for (; fiber; fiber = fiber.sibling as typeof fiber) {
        const kind = kindOf(fiber)
        kinds[kind] = (kinds[kind] ?? 0) + 1
        visit(fiber.child as typeof fiber)
      }
    }
    visit((container as unknown as Record<string, { stateNode: { current: { child: never } } }>)[key].stateNode.current.child)
    return kinds
  }
  try {
    act(() => root.render(tree()))
    const mount = count()
    act(() => root.render(tree()))
    return { mount, again: count() }
  } finally {
    act(() => root.unmount())
    container.remove()
  }
}

beforeEach(() => __resetStaticCss())
afterEach(() => __resetStaticCss())

// Nodes that carry their whole style's name, and the same tree with each node's
// css on the runtime path, as a record of what each costs. Each renders from a
// component, where an app's walk runs and reads its cache.
describe('named styles', () => {
  // Emotion's cache in the browser lives as long as the page, so each case
  // names its own styles, none of which an earlier case put in.
  let suite = 0
  let prefix = ''
  const named = (index: number) => ({ __meo$: 2, __meo$n: `${prefix}${index}` })
  beforeEach(() => {
    prefix = `f${++suite}x`
    for (let index = 0; index < CHILDREN; index++) registerStaticCss(`${prefix}${index}`, [[`${prefix}${index}`, `order:${index};`]])
  })
  const inComponent = (tree: () => NodeInstance) => () =>
    createElement(function App() {
      return tree().render() as ReactElement
    })

  // The first, with no rule before it, carries the run of the rest, as the compiler marks it.
  it('cost their host elements, and a renderer for the first, which carries the rest', () => {
    const fibers = census(
      inComponent(() => Div({ children: Array.from({ length: CHILDREN }, (_, index) => Div({ key: String(index), ...named(index) } as never)) })),
    )
    expect(fibers).toEqual({
      mount: { App: 1, 'host:div': CHILDREN + 1, Styled: 1, RuleInsertion: 1 },
      again: { App: 1, 'host:div': CHILDREN + 1, Styled: 1 },
    })
  })

  it('against the runtime path, which costs a renderer each and a leaf each until inserted', () => {
    // Held in a variable, so the compiler leaves it on the runtime path with extraction on too.
    const runtimeCss = (index: number) => ({ order: index + suite * 100 })
    const fibers = census(
      inComponent(() => Div({ children: Array.from({ length: CHILDREN }, (_, index) => Div({ key: String(index), css: runtimeCss(index) })) })),
    )
    expect(fibers).toEqual({
      mount: { App: 1, 'host:div': CHILDREN + 1, Styled: CHILDREN, RuleInsertion: CHILDREN },
      again: { App: 1, 'host:div': CHILDREN + 1, Styled: CHILDREN },
    })
  })

  it('cost a renderer for the first named node after each component, and each component’s own', () => {
    const Card = () => Div(named(CHILDREN - 1) as never).render() as ReactElement
    const slotted = census(
      inComponent(() =>
        Div({
          children: Array.from({ length: CHILDREN }, (_, index) => [
            Div({ key: `s${index}`, ...named(index) } as never),
            Node(Card, { key: `c${index}` }),
          ]).flat(),
        } as never),
      ),
    )
    // Each node after a Card begins a stretch, and each Card's root begins its
    // own walk: every one carries, as the compiler marks them, and nothing is
    // added to the children.
    expect(slotted).toEqual({
      mount: { App: 1, Card: CHILDREN, 'host:div': 2 * CHILDREN + 1, Styled: 2 * CHILDREN, RuleInsertion: 2 * CHILDREN },
      again: { App: 1, Card: CHILDREN, 'host:div': 2 * CHILDREN + 1, Styled: 2 * CHILDREN },
    })
  })

  // Outside any component's render there is no cache to read, so a named node
  // renders through `StyledRenderer`, as its css would, at the runtime path's cost.
  it('cost what the runtime path costs when the walk runs outside any component', () => {
    const fibers = census(
      () => Div({ children: Array.from({ length: CHILDREN }, (_, index) => Div({ key: String(index), ...named(index) } as never)) }).render() as ReactElement,
    )
    expect(fibers).toEqual({
      mount: { 'host:div': CHILDREN + 1, Styled: CHILDREN, RuleInsertion: CHILDREN },
      again: { 'host:div': CHILDREN + 1, Styled: CHILDREN },
    })
  })

  // A generated list reaches React as one list argument. Anything beside it
  // would make it a nested list, wrapped in a fiber of its own.
  it('add no fiber to a generated list of children', () => {
    const fibers = census(
      inComponent(() =>
        Div({
          __meo$: 2,
          __meo$list: true,
          children: Array.from({ length: CHILDREN }, (_, index) => Div({ key: String(index), ...named(index) } as never)),
        } as never),
      ),
    )
    // The first item carries the list's run.
    expect(fibers.again).toEqual({ App: 1, 'host:div': CHILDREN + 1, Styled: 1 })
    expect(fibers.mount['tag 7']).toBeUndefined()
  })

  it('cost nothing between components', () => {
    const Card = () => Div(named(0) as never).render() as ReactElement
    const idle = census(
      inComponent(() =>
        Div({
          children: Array.from({ length: CHILDREN }, (_, index) => Node(Card, { key: `c${index}` })),
        } as never),
      ),
    )
    // Only the Cards' own: each Card's root carries its walk's style.
    expect(idle).toEqual({
      mount: { App: 1, Card: CHILDREN, 'host:div': CHILDREN + 1, Styled: CHILDREN, RuleInsertion: CHILDREN },
      again: { App: 1, Card: CHILDREN, 'host:div': CHILDREN + 1, Styled: CHILDREN },
    })
  })
})

// A grid of cards, each a named card with a named title and a component after
// it, as a list page is: what the runs cost against the runtime twin, with the
// carriers the compiler marks and with none marked, where the walk carries at
// the first named node after each cut, and with the component a plain one or a
// `Component(...)`.
describe('a card list', () => {
  const CARDS = 10
  type Placement = 'runtime' | 'carriers' | 'unmarked'
  let round = 0
  /** A node's css: on the runtime path, or named as the compiler names it, a carrier where `carrier` and the placement marks them. */
  const style = (placement: Placement, css: Record<string, unknown>, carrier = false) => {
    if (placement === 'runtime') return { css }
    const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
    const { name, styles } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
    registerStaticCss(`m-${name}`, [[name, styles]])
    return { __meo$: 2, __meo$n: name, ...(carrier && placement === 'carriers' && { [STATIC_CARRIER_MARKER]: 1 }) }
  }
  const Plain = () => Span('leaf').render() as ReactElement

  function grid(placement: Placement, component: 'plain' | 'Component'): () => ReactElement {
    // Each row names styles no earlier row put in the page's cache.
    const at = ++round
    const Leaf = Component(() => Span('leaf'))
    return () =>
      createElement(function App() {
        return Div({
          ...style(placement, { display: 'grid', gap: at }, true),
          children: [
            Span('h', { key: 'h', ...style(placement, { fontSize: at }) }),
            ...Array.from({ length: CARDS }, (_, index) =>
              Div({
                key: index,
                ...style(placement, { padding: at }, true),
                children: [Span('b', style(placement, { order: at }) as never), component === 'Component' ? Leaf({ key: 'l' }) : Node(Plain, { key: 'l' })],
              }),
            ),
          ],
        } as never).render() as ReactElement
      })
  }

  const RENDERER = 'Renderer(AnonymousFunctionComponent)'
  const base = (component: 'plain' | 'Component') => ({
    App: 1,
    'host:div': CARDS + 1,
    'host:span': 2 * CARDS + 1,
    [component === 'plain' ? 'Plain' : RENDERER]: CARDS,
  })
  // A renderer per styled node and a leaf each until inserted, as Emotion's css prop costs.
  const runtime = { Styled: 2 * CARDS + 2, RuleInsertion: 2 * CARDS + 2 }
  const runtimeAgain = { Styled: 2 * CARDS + 2 }
  // A renderer per carrier: the grid and each card, which keep that type in every
  // render. A leaf only for those that take a run: the grid, and each card after
  // a component. The first card follows the grid's rule, so its rule goes in
  // with the grid's run, as an unmarked node's would, and it has no leaf.
  const carriers = { Styled: CARDS + 1, RuleInsertion: CARDS }
  const carriersAgain = { Styled: CARDS + 1 }
  // With none marked, the walk carries at the grid and at each card after a
  // component: every card but the first, whose run follows the grid's.
  const promoted = { Styled: CARDS, RuleInsertion: CARDS }
  const promotedAgain = { Styled: CARDS }

  it.each([
    ['plain', 'runtime', runtime, runtimeAgain],
    ['plain', 'carriers', carriers, carriersAgain],
    ['plain', 'unmarked', promoted, promotedAgain],
    ['Component', 'runtime', runtime, runtimeAgain],
    ['Component', 'carriers', carriers, carriersAgain],
    ['Component', 'unmarked', promoted, promotedAgain],
  ] as const)('with a %s component and %s', (component, placement, mount, again) => {
    expect(census(grid(placement, component))).toEqual({ mount: { ...base(component), ...mount }, again: { ...base(component), ...again } })
  })
})
