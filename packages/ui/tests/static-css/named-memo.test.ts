// @vitest-environment jsdom
//
// A memoized node holding named styles: `MeoMemo` runs its walk inside
// `useMemo`, where React allows no hook, so the walk reads the contexts it needs
// from what `MeoMemo` read at its top level, and React reports nothing.
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { act, createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { Div, Span } from '@src/main.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  __resetStaticCss()
  vi.restoreAllMocks()
})

it('renders a memoized node with named styles with no hook called inside useMemo', () => {
  registerStaticCss('m-memoa', [['memoa', 'order:1;']])
  registerStaticCss('m-memob', [['memob', 'color:var(--meonode-theme-primary);']])
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  const page = createElement(function Page() {
    return Div({
      children: Div({ __meo$: 2, __meo$n: 'memoa', children: Span('b', { __meo$: 2, __meo$n: 'memob' }) } as never, []),
    }).render() as ReactElement
  })
  act(() => root.render(createElement(CacheProvider, { value: createCache({ key: 'css', speedy: true }) }, page)))
  act(() => root.unmount())
  expect(errors.mock.calls.map(call => String(call[0])).filter(text => /Hooks/.test(text))).toEqual([])
  expect(document.head.querySelectorAll('style[data-emotion]').length).toBeGreaterThan(0)
})
