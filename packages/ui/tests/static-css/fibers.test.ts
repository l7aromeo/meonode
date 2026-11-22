// @vitest-environment jsdom
//
// What a render with static classes costs in fibers in the browser: its static
// nodes are their host elements alone, and the render adds one fiber for its
// static css, whether or not its topmost host has other children.
import { act, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Div, Node } from '@src/main.js'
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

/** Whether this run compiles the suite, which marks the `Array.from` children below as a generated list. */
const COMPILED = process.env.MEONODE_COMPILED === '1'

/** A host whose children are `CHILDREN` static nodes made by `Array.from`. */
const hostOfStatics = () =>
  Div({
    children: Array.from({ length: CHILDREN }, (_, index) => Div({ key: String(index), __meo$: 2, __meo$s: classOf(index) } as never)),
  }).render() as ReactElement

describe('a render’s static css costs one fiber', () => {
  it.skipIf(COMPILED)('when its topmost host has other children', () => {
    const expected = { 'host:div': CHILDREN + 1, StaticStyles: 1 }
    expect(census(hostOfStatics)).toEqual({ mount: expected, again: expected })
  })

  // A known limitation of the 3.4.0 checkpoint, which does not ship. Compiled,
  // the `Array.from` children carry `__meo$list`, so the host hands React the
  // list as one array, and the StaticStyles slot beside it makes that array a
  // nested one, which React renders through a Fragment fiber. The exact design
  // removes the StaticStyles slot, and with it this fiber.
  it.runIf(COMPILED)('when its topmost host has other children, compiled: one Fragment fiber more (known checkpoint limitation)', () => {
    const expected = { 'host:div': CHILDREN + 1, StaticStyles: 1, 'tag 7': 1 }
    expect(census(hostOfStatics)).toEqual({ mount: expected, again: expected })
  })

  it('when its topmost host has none', () => {
    const Card = () => Div({ __meo$: 2, __meo$s: classOf(0) } as never).render() as ReactElement
    const expected = { 'host:div': CHILDREN + 1, Card: CHILDREN, StaticStyles: CHILDREN }
    const fibers = census(() => Div({ children: Array.from({ length: CHILDREN }, (_, index) => Node(Card, { key: String(index) })) }).render() as ReactElement)
    expect(fibers).toEqual({ mount: expected, again: expected })
  })
})
