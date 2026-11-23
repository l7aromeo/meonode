// @vitest-environment jsdom
//
// A node the compiler marks as a carrier that follows a rule in a render carries
// nothing in it: its rule goes in with the run of the rule before it, as an
// unmarked node's does, and it renders through `StyledRenderer` only to keep
// that type, with no leaf. Here every named node is marked, as the compiler
// marks a call site it can't prove, around each place a walk is cut: the first
// node since a cut, after a component child, across a Fragment, under Suspense,
// and after a memoized subtree that bails out. Against the runtime twin, every
// step has the same state, the same rules in the same order, and `.render()`
// the same children. A render React discards inserts nothing.
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { act, createElement, startTransition, use, useState, type ReactElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Div, Fragment, Node, Span, Suspense, type NodeInstance } from '@src/main.js'
import { __resetStaticCss } from '@src/util/static-css.util.js'
import { BLUE, compiledStyle, counter, GRID, keyOf, RED, rules, run, runtimeStyle, unmountCarrierRoot, type Style } from './_carrier-pages.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Every named node marked as a carrier; a runtime node stays one. */
const markedStyle: Style = (css, options) => compiledStyle(css, { ...options, carrier: !options?.runtime })

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

/** A host whose node is marked, holding a counter, which a remount of the host resets. */
const holder = (style: Style, keyed: boolean, key: string, css: Record<string, unknown>) =>
  Div({ ...keyOf(keyed, key), ...style(css), children: counter(`${key}c`, keyed) })

const CASES: Record<string, (on: boolean, style: Style, keyed: boolean) => NodeInstance> = {
  // `h` is first since the cut while the counter is in, and follows the grid's rule while it is out.
  'first since a cut: a conditional counter, then a marked host holding a counter': (on, style, keyed) =>
    Div({
      ...style(GRID),
      children: [on && counter('x', keyed), holder(style, keyed, 'h', RED), Span('t', { ...keyOf(keyed, 't'), ...style(BLUE) })],
    }),
  // The counter inside `h` cuts the walk where `h` completes, so `t` is first after it.
  'after a component child: a host that holds a counter or a static node, then a marked host': (on, style, keyed) =>
    Div({
      ...style(GRID),
      children: [
        Div({ ...keyOf(keyed, 'h'), ...style(RED), children: on ? counter('x', keyed) : Span('i', style({ order: 1 })) }),
        holder(style, keyed, 't', BLUE),
      ],
    }),
  // A Fragment is no cut: the walk passes through it.
  'across a Fragment: a conditional counter and a marked host in it, a marked node after it': (on, style, keyed) =>
    Div({
      ...style(GRID),
      children: [
        Fragment({ ...keyOf(keyed, 'f'), children: [on && counter('x', keyed), holder(style, keyed, 'h', RED)] }),
        Span('t', { ...keyOf(keyed, 't'), ...style(BLUE) }),
      ],
    }),
  // A Suspense boundary cuts the walk before and after it: `p` is first in it,
  // and `h` follows `p`'s rule while the counter is out.
  'under Suspense: a marked node, a conditional counter and a marked host in it, a marked node after it': (on, style, keyed) =>
    Div({
      ...style(GRID),
      children: [
        Suspense({
          ...keyOf(keyed, 's'),
          fallback: 'loading',
          children: [Span('p', { ...keyOf(keyed, 'p'), ...style({ order: 2 }) }), on && counter('x', keyed), holder(style, keyed, 'h', RED)],
        }),
        Span('t', { ...keyOf(keyed, 't'), ...style(BLUE) }),
      ],
    }),
  // The memoized subtree's dependencies never change, so it bails out on every toggle.
  'a memoized subtree that bails out, after a conditional counter': (on, style, keyed) =>
    Div({
      ...style(GRID),
      children: [
        on && counter('x', keyed),
        Div({ ...keyOf(keyed, 'm'), ...style({ order: 3 }), children: [Span('a', style(RED)), holder(style, keyed, 'h', BLUE)] }, []),
        Span('t', { ...keyOf(keyed, 't'), ...style({ order: 4 }) }),
      ],
    }),
}

describe.each([
  ['unkeyed', false],
  ['keyed', true],
] as const)('%s, every named node marked', (_, keyed) => {
  describe.each([
    ['with the counter in at first', true],
    ['with the counter out at first', false],
  ] as const)('%s', (__, initially) => {
    it.each(Object.entries(CASES))('%s', (___, page) => {
      // Key warnings differ by design between keyed and unkeyed runs, not between twins.
      const { keyWarnings: _runtimeWarnings, ...expected } = run(on => page(on, runtimeStyle, keyed), initially)
      expect(expected.steps.at(-1)!.rules.length).toBeGreaterThan(0)
      const { keyWarnings: _compiledWarnings, ...compiled } = run(on => page(on, markedStyle, keyed), initially)
      expect(compiled).toEqual(expected)
    })
  })
})

describe('a render React discards', () => {
  /** Never settles: a transition that renders a component reading it is never committed. */
  function Waits({ data }: { data: Promise<string> }): ReactNode {
    return use(data)
  }

  /**
   * Mounts the grid with one marked node, then renders, in a transition, two
   * more after it whose rules are new, and a component that waits. Returns the
   * rules and DOM before, while the transition waits, and once it commits.
   */
  async function discarded(style: Style) {
    __resetStaticCss()
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    let resolve!: (value: string) => void
    const data = new Promise<string>(r => (resolve = r))
    let next = () => {}
    function Page() {
      const [more, setMore] = useState(false)
      next = () => startTransition(() => setMore(true))
      return Div({
        ...style(GRID),
        children: [
          Span('a', { key: 'a', ...style(RED) }),
          ...(more ? [Span('h', { key: 'h', ...style({ order: 5 }) }), Span('t', { key: 't', ...style({ order: 6 }) }), Node(Waits, { key: 'w', data })] : []),
        ],
      }).render() as ReactElement
    }
    const container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    await act(async () => root!.render(createElement(CacheProvider, { value: createCache({ key: 'css', speedy: true }) }, createElement(Page))))
    const before = { rules: rules(), html: container.innerHTML }
    await act(async () => next())
    const waiting = { rules: rules(), html: container.innerHTML }
    await act(async () => {
      resolve('in')
      await data
    })
    const committed = { rules: rules(), html: container.innerHTML }
    return { before, waiting, committed }
  }

  it('inserts no rule of it, and its rules go in when it commits, as the runtime twin’s', async () => {
    const expected = await discarded(runtimeStyle)
    act(() => root!.unmount())
    root = undefined
    const compiled = await discarded(markedStyle)
    expect(compiled.waiting).toEqual(compiled.before)
    expect(compiled.committed.rules.length).toBe(compiled.before.rules.length + 2)
    expect(compiled).toEqual(expected)
  })
})
