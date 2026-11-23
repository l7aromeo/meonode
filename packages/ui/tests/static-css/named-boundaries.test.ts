// @vitest-environment jsdom
//
// A named node beside a boundary the compiler does not see as a component, in
// the browser: once every boundary has rendered, the elements have the same
// classes and the sheet the same rules in the same order as uncompiled, and
// `.render()` returns the same structure.
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { act, createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetStaticCss } from '@src/util/static-css.util.js'
import { shapedAsync } from './_render-shapes.js'
import { CASES, compiledStyle, runtimeStyle, type Style } from './_boundaries.js'
import type { NodeInstance } from '@src/main.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const rules = () =>
  [...document.head.querySelectorAll<HTMLStyleElement>('style[data-emotion^="css"]')].flatMap(element =>
    [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText),
  )

/** Renders the tree, resolves what its content waits for, and lets every boundary render. */
const renderAll = shapedAsync(async (tree: (style: Style, data: Promise<string>) => NodeInstance, style: Style) => {
  __resetStaticCss()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  let resolve!: (value: string) => void
  const data = new Promise<string>(r => (resolve = r))
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  const page = createElement(function Page() {
    return tree(style, data).render() as ReactElement
  })
  await act(async () => root.render(createElement(CacheProvider, { value: createCache({ key: 'css', speedy: true }) }, page)))
  await act(async () => {
    resolve('in')
    await data
  })
  // A hidden Activity's content renders at the lowest priority, after the rest.
  await act(async () => await new Promise(r => setTimeout(r, 20)))
  const classes = [...document.body.querySelectorAll('[data-n]')].map(element => `${element.getAttribute('data-n')}: ${element.className}`)
  const result = { classes, rules: rules() }
  act(() => root.unmount())
  return result
})

afterEach(() => {
  __resetStaticCss()
  vi.restoreAllMocks()
})

describe('a named node beside a boundary, in the browser', () => {
  it.each(CASES)('%s', async (_, tree) => {
    const expected = await renderAll(tree, runtimeStyle)
    expect(expected.rules.length).toBeGreaterThan(0)
    expect(await renderAll(tree, compiledStyle)).toEqual(expected)
  })
})
