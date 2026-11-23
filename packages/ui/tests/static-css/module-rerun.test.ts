// @vitest-environment jsdom
//
// A module that runs again, as Fast Refresh runs an edited module or a bundler
// a re-evaluated one. Compiled, it registers its styles each time it runs; the
// registration is keyed by its rules, so a module run again with the same
// rules keeps its names and its rules go in once, and one run again with
// edited rules brings its new ones, which its elements then use.
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { act, createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { NodeInstance } from '@src/main.js'
import { __resetStaticCss } from '@src/util/static-css.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface CardModule {
  Card: () => NodeInstance
}

const cache = createCache({ key: 'css', speedy: true })
const root = createRoot(document.body.appendChild(document.createElement('div')))
const rules = () => [...document.head.querySelectorAll('style')].flatMap(element => [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText))

/** Renders the module's card on the one root, as a refresh re-renders in place; returns its class, colour and the page's rules. */
function show({ Card }: CardModule) {
  act(() =>
    root.render(
      createElement(
        CacheProvider,
        { value: cache },
        createElement(() => Card().render() as ReactElement),
      ),
    ),
  )
  const card = document.querySelector<HTMLElement>('[data-card]')!
  return { className: card.className, color: getComputedStyle(card).color, rules: rules() }
}

// Each case loads the modules itself: a module cached from an earlier case would not register again.
beforeEach(() => vi.resetModules())

afterEach(() => {
  act(() => root.render(null))
  __resetStaticCss()
})

it('keeps a module’s names and writes its rules once when it runs again unchanged', async () => {
  const first = show((await import('./fixtures/refresh-card.before.js')) as CardModule)
  expect(first.color).toBe('rgb(200, 0, 0)')
  vi.resetModules()
  const again = show((await import('./fixtures/refresh-card.before.js')) as CardModule)
  expect(again).toEqual(first)
  // No rule is in the page twice.
  expect(new Set(again.rules).size).toBe(again.rules.length)
})

it('styles a module’s elements with its edited rules when it runs again changed', async () => {
  const before = show((await import('./fixtures/refresh-card.before.js')) as CardModule)
  expect(before.color).toBe('rgb(200, 0, 0)')
  vi.resetModules()
  const after = show((await import('./fixtures/refresh-card.after.js')) as CardModule)
  expect(after.color).toBe('rgb(0, 0, 200)')
  expect(after.className).not.toBe(before.className)
  expect(after.rules.some(rule => rule.includes('rgb(0, 0, 200)') && after.className.split(' ').some(name => rule.includes(`.${name}`)))).toBe(true)
})
