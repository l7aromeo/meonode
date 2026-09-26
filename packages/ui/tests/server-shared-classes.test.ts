// @vitest-environment node
//
// A class compiled in one request cache and handed to a component that compiles
// in another — a caller outside a `'use cache'` scope and a component inside it.
// The component composes the class through the store of classes compiled for
// components, as it would in the request that compiled it.
//
// `react` is replaced with the client build minus `useState`, the shape of the
// `react-server` build, so these compiles take the RSC layer's path. Its `cache`
// memoizes until `newRequest()`, which stands in for the component's scope
// getting a request cache of its own.
import { Fragment, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({ values: new Map<unknown, unknown>() }))

vi.mock('react', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>
  const { useState: _useState, ...serverBuild } = actual
  const cache = (fn: () => unknown) => () => {
    if (!request.values.has(fn)) request.values.set(fn, fn())
    return request.values.get(fn)
  }
  return { ...serverBuild, cache }
})

const { createNode, Div } = await import('@src/main.js')
const { compileServerEmotionRule, SHARED_CLASS_LIMIT, SHARED_STYLES_BYTE_LIMIT, SHARED_STYLES_ENTRY_LIMIT, __sharedClassStoreSize, __clearSharedClassStore } =
  await import('@src/util/server-emotion.util.js')
const { __resetThemeDiagnostics } = await import('@src/util/theme-diagnostics.util.js')

const newRequest = () => {
  request.values = new Map()
}

const warnings: string[] = []
let originalWarn: typeof console.warn

beforeEach(() => {
  newRequest()
  __clearSharedClassStore()
  __resetThemeDiagnostics()
  warnings.length = 0
  originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(String(args[0]))
  }
})

afterEach(() => {
  console.warn = originalWarn
  vi.unstubAllEnvs()
  __resetThemeDiagnostics()
})

type Element = ReactElement<{ children?: unknown; className?: string }>

const childrenOf = (element: Element) => {
  const children = element.props.children
  return (Array.isArray(children) ? children : [children]) as unknown[]
}
const ruleOf = (element: Element) => ((childrenOf(element).at(-1) as Element[])[0].props as { children: string }).children
const uncomposed = () => warnings.filter(text => text.includes('could not be composed'))

/** Styles itself and passes on the className it is handed. */
function Card({ className, children }: { className?: string; children?: string }) {
  return Div({ className, color: 'rgb(0, 128, 128)', children }).render() as Element
}
const CardNode = createNode(Card)

/** The props `CardNode(props)` hands `Card`, compiled in the current request. */
const cardProps = (props: Record<string, unknown>) => {
  const root = CardNode({ ...props, children: 'conflict' }).render() as Element
  return ((root.type === Fragment ? childrenOf(root)[0] : root) as ReactElement<{ className?: string; children?: string }>).props
}

describe('a class handed across a cache boundary', () => {
  it('composes into one class with the component’s own css, the handed styles winning', () => {
    const props = cardProps({ css: { color: 'rgb(255, 165, 0)' } })
    newRequest()
    const div = Card(props)
    const classes = (div.props.className as string).split(' ')
    const rule = ruleOf(div)

    expect(classes).toHaveLength(1)
    expect(rule.lastIndexOf('color:rgb(255, 165, 0)')).toBeGreaterThan(rule.lastIndexOf('color:rgb(0, 128, 128)'))
    expect(uncomposed()).toEqual([])
  })

  it('composes it into the same class it composes into without the boundary', () => {
    const props = cardProps({ css: { color: 'rgb(255, 165, 0)' } })
    const sameRequest = Card(props).props.className
    newRequest()

    expect(Card(props).props.className).toBe(sameRequest)
  })

  it('keeps no class compiled for a host tag', () => {
    Div({ css: { color: 'rgb(1, 2, 3)' }, children: 'host' }).render()

    expect(__sharedClassStoreSize().entries).toBe(0)
  })
})

describe('the store of classes compiled for components', () => {
  const share = (i: number) => compileServerEmotionRule({ width: `${i}px` }, undefined, { share: true })!

  it(`holds at most ${SHARED_CLASS_LIMIT} classes, dropping the least recently used`, () => {
    const first = share(0)
    let most = 0
    for (let i = 1; i <= 3 * SHARED_CLASS_LIMIT; i++) {
      share(i)
      most = Math.max(most, __sharedClassStoreSize().entries)
    }

    expect(most).toBe(SHARED_CLASS_LIMIT)
    newRequest()
    expect(compileServerEmotionRule({ color: 'red' }, first.ownClassName)!.className).toBe(
      `${first.ownClassName} ${compileServerEmotionRule({ color: 'red' })!.ownClassName}`,
    )
  })

  // The eviction threshold: how many other distinct classes compiled for
  // components, by any request, it takes between a caller's compile and the
  // component's to lose the caller's class. It depends on where in the store's
  // current generation the class lands: first, it outlives the whole limit less
  // one; last, half the limit.
  const composesAfter = (before: number, others: number) => {
    __clearSharedClassStore()
    newRequest()
    for (let i = 0; i < before; i++) share(-1 - i)
    const handed = compileServerEmotionRule({ color: 'rgb(255, 165, 0)' }, undefined, { share: true })!.ownClassName
    for (let i = 0; i < others; i++) share(i)
    newRequest()
    return compileServerEmotionRule({ color: 'rgb(0, 128, 128)' }, handed)!.className.split(' ').length === 1
  }

  it('keeps a class through its limit less one other classes when it lands first', () => {
    expect(composesAfter(0, SHARED_CLASS_LIMIT - 1)).toBe(true)
    expect(composesAfter(0, SHARED_CLASS_LIMIT)).toBe(false)
  })

  it('keeps a class through at least half its limit of other classes wherever it lands', () => {
    expect(composesAfter(SHARED_CLASS_LIMIT / 2 - 1, SHARED_CLASS_LIMIT / 2)).toBe(true)
    expect(composesAfter(SHARED_CLASS_LIMIT / 2 - 1, SHARED_CLASS_LIMIT / 2 + 1)).toBe(false)
  })

  it('keeps a class it keeps being asked for, however many other classes are kept', () => {
    const handed = compileServerEmotionRule({ color: 'rgb(255, 165, 0)' }, undefined, { share: true })!.ownClassName
    const composes = () => {
      newRequest()
      return compileServerEmotionRule({ color: 'rgb(0, 128, 128)' }, handed)!.className.split(' ').length === 1
    }
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < SHARED_CLASS_LIMIT / 2; i++) share(round * SHARED_CLASS_LIMIT + i)
      expect(composes()).toBe(true)
    }
  })

  it('keeps its style text within its byte limit, and skips an entry too large to keep', () => {
    const large = 'x'.repeat(SHARED_STYLES_ENTRY_LIMIT / 2)
    for (let i = 0; i < 200; i++) compileServerEmotionRule({ '--filler': `${large}${i}` } as never, undefined, { share: true })
    const { entries, length } = __sharedClassStoreSize()

    expect(length).toBeLessThanOrEqual(SHARED_STYLES_BYTE_LIMIT)
    expect(entries).toBeLessThan(200)

    compileServerEmotionRule({ '--filler': 'x'.repeat(SHARED_STYLES_ENTRY_LIMIT + 1) } as never, undefined, { share: true })
    expect(__sharedClassStoreSize().entries).toBe(entries)
  })

  it('reports a handed class it cannot compose once in development', () => {
    const lost = 'meonode-css-evicted'
    compileServerEmotionRule({ color: 'red' }, lost)
    compileServerEmotionRule({ color: 'blue' }, lost)

    expect(uncomposed()).toHaveLength(1)
    expect(uncomposed()[0]).toContain(lost)
  })

  it('stays silent about it in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    __resetThemeDiagnostics()
    compileServerEmotionRule({ color: 'red' }, 'meonode-css-evicted')

    expect(uncomposed()).toEqual([])
  })

  it('does not report a class it did not generate', () => {
    compileServerEmotionRule({ color: 'red' }, 'utility')

    expect(uncomposed()).toEqual([])
  })
})
