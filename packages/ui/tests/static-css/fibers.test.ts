// @vitest-environment jsdom
//
// What a render with static classes costs in fibers in the browser: its static
// nodes are their host elements alone, and the render adds one fiber for its
// static css, whether or not its topmost host has other children.
import { act, createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Div, Node, type NodeInstance } from '@src/main.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CHILDREN = 10
const classOf = (index: number) => `mn-0000000000${String(index).padStart(3, '0')}`

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

beforeEach(() => {
  __resetStaticCss()
  registerStaticCss(
    'fibers',
    Array.from({ length: CHILDREN }, (_, index) => [1, classOf(index), `.${classOf(index)}{order:${index};}`] as const),
  )
})
afterEach(() => __resetStaticCss())

describe('a render’s static css costs one fiber', () => {
  it('when its topmost host has other children', () => {
    const expected = { 'host:div': CHILDREN + 1, StaticStyles: 1 }
    const fibers = census(
      () =>
        Div({
          children: Array.from({ length: CHILDREN }, (_, index) => Div({ key: String(index), __meo$: 2, __meo$s: classOf(index) } as never)),
        }).render() as ReactElement,
    )
    expect(fibers).toEqual({ mount: expected, again: expected })
  })

  it('when its topmost host has none', () => {
    const Card = () => Div({ __meo$: 2, __meo$s: classOf(0) } as never).render() as ReactElement
    const expected = { 'host:div': CHILDREN + 1, Card: CHILDREN, StaticStyles: CHILDREN }
    const fibers = census(() => Div({ children: Array.from({ length: CHILDREN }, (_, index) => Node(Card, { key: String(index) })) }).render() as ReactElement)
    expect(fibers).toEqual({ mount: expected, again: expected })
  })
})

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

  it('cost their host elements, and one StaticStyles for the render until its styles are in', () => {
    const fibers = census(
      inComponent(() => Div({ children: Array.from({ length: CHILDREN }, (_, index) => Div({ key: String(index), ...named(index) } as never)) })),
    )
    expect(fibers).toEqual({ mount: { App: 1, 'host:div': CHILDREN + 1, StaticStyles: 1 }, again: { App: 1, 'host:div': CHILDREN + 1 } })
  })

  it('against the runtime path, which costs a renderer each and a leaf each until inserted', () => {
    const fibers = census(
      inComponent(() => Div({ children: Array.from({ length: CHILDREN }, (_, index) => Div({ key: String(index), css: { order: index + suite * 100 } })) })),
    )
    expect(fibers).toEqual({
      mount: { App: 1, 'host:div': CHILDREN + 1, Styled: CHILDREN, RuleInsertion: CHILDREN },
      again: { App: 1, 'host:div': CHILDREN + 1, Styled: CHILDREN },
    })
  })

  it('cost a leaf at a slot only while its run is not in yet', () => {
    const Card = () => Div(named(CHILDREN - 1) as never).render() as ReactElement
    const slotted = census(
      inComponent(() =>
        Div({
          __meo$: 2,
          __meo$p: Array.from({ length: CHILDREN }, (_, index) => 2 * index + 1),
          children: Array.from({ length: CHILDREN }, (_, index) => [
            Div({ key: `s${index}`, ...named(index) } as never),
            Node(Card, { key: `c${index}` }),
          ]).flat(),
        } as never),
      ),
    )
    // On mount one `StaticStyles` per slot with a run, and one per Card: each
    // Card renders before any commits, as the runtime path's leaves do.
    expect(slotted).toEqual({
      mount: { App: 1, Card: CHILDREN, 'host:div': 2 * CHILDREN + 1, StaticStyles: 2 * CHILDREN },
      again: { App: 1, Card: CHILDREN, 'host:div': 2 * CHILDREN + 1 },
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

  it('cost nothing at an idle slot', () => {
    const Card = () => Div(named(0) as never).render() as ReactElement
    const idle = census(
      inComponent(() =>
        Div({
          __meo$: 2,
          __meo$p: Array.from({ length: CHILDREN }, (_, index) => index),
          children: Array.from({ length: CHILDREN }, (_, index) => Node(Card, { key: `c${index}` })),
        } as never),
      ),
    )
    // Only the Cards' own, on mount.
    expect(idle).toEqual({
      mount: { App: 1, Card: CHILDREN, 'host:div': CHILDREN + 1, StaticStyles: CHILDREN },
      again: { App: 1, Card: CHILDREN, 'host:div': CHILDREN + 1 },
    })
  })
})
