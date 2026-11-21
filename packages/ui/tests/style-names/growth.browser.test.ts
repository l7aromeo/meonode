// @vitest-environment jsdom
//
// The memo of names over a page's life: mounted again and again, and moving
// between routes whose styles together pass its limit.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { Div } from '@src/main.js'
import { __clearStyleNameMemo, __styleNameMemoSize, STYLE_NAME_MEMO_ENTRIES } from '@src/util/style-name.util.js'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  __clearStyleNameMemo()
  document.body.innerHTML = ''
})

/** A page of `count` elements, each with a style of its own, numbered from `from`. */
const page = (from: number, count: number) =>
  Div({ children: Array.from({ length: count }, (_, i) => Div({ key: i, 'data-i': from + i, css: { paddingLeft: `${from + i}px` }, children: 'x' })) }).render()

describe('the memo of names', () => {
  it('grows no further when the same page mounts again and again', () => {
    const container = document.body.appendChild(document.createElement('div'))
    const sizes: number[] = []
    for (let mount = 0; mount < 20; mount++) {
      const root = createRoot(container)
      act(() => root.render(page(0, 500)))
      act(() => root.unmount())
      sizes.push(__styleNameMemoSize().entries)
    }

    expect(new Set(sizes)).toEqual(new Set([500]))
  })

  it(`stays within ${STYLE_NAME_MEMO_ENTRIES} names across routes whose styles pass it, and names each element by its own style`, () => {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    const ROUTES = 21
    const PER_ROUTE = 1000
    let most = 0
    for (let route = 0; route < ROUTES; route++) {
      act(() => root.render(page(route * PER_ROUTE, PER_ROUTE)))
      most = Math.max(most, __styleNameMemoSize().entries)
    }
    // Back to the first route, whose names the memo has dropped.
    act(() => root.render(page(0, PER_ROUTE)))
    const element = document.querySelector('[data-i="7"]') as HTMLElement

    expect(ROUTES * PER_ROUTE).toBeGreaterThan(STYLE_NAME_MEMO_ENTRIES)
    expect(most).toBeLessThanOrEqual(STYLE_NAME_MEMO_ENTRIES)
    expect(getComputedStyle(element).paddingLeft).toBe('7px')
    act(() => root.unmount())
  }, 30_000)
})
