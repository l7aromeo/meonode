// @vitest-environment jsdom
//
// Two different styles in the browser, on one page and in renders one after
// another: each element must get its own class, and its own rule.
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { afterEach, describe, expect, it } from 'vitest'
import { Div } from '@src/main.js'
import { FIRST, FIRST_RGB, SECOND, SECOND_RGB } from '@tests/style-names/pair.js'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mounted = new Set<Root>()

afterEach(() => {
  act(() => mounted.forEach(root => root.unmount()))
  mounted.clear()
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

/** Mounts `tree` with `cache`, each test's own, as the page's Emotion cache. */
function mount(tree: ReactNode, cache: ReturnType<typeof createCache>) {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  mounted.add(root)
  act(() => root.render(createElement(CacheProvider, { value: cache }, tree)))
  return { container, root }
}

const byTestId = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement

describe('two different styles on one page', () => {
  it('give each element its own class and its own colour', () => {
    const cache = createCache({ key: 'css' })
    mount(
      Div({
        children: [
          Div({ key: 'first', 'data-testid': 'first', css: FIRST, children: 'first' }),
          Div({ key: 'second', 'data-testid': 'second', css: SECOND, children: 'second' }),
        ],
      }).render(),
      cache,
    )

    expect(byTestId('first').className).not.toBe(byTestId('second').className)
    expect([getComputedStyle(byTestId('first')).color, getComputedStyle(byTestId('second')).color]).toEqual([FIRST_RGB, SECOND_RGB])
  })
})

describe('a style rendered after a different one on the same page', () => {
  it('gets its own colour, though the page still holds the earlier rule', () => {
    const cache = createCache({ key: 'css' })
    const first = mount(Div({ 'data-testid': 'first', css: FIRST, children: 'first' }).render(), cache)
    act(() => first.root.unmount())
    mounted.delete(first.root)
    mount(Div({ 'data-testid': 'second', css: SECOND, children: 'second' }).render(), cache)

    expect(getComputedStyle(byTestId('second')).color).toBe(SECOND_RGB)
  })
})
