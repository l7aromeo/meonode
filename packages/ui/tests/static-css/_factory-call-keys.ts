// An unkeyed list of a factory's calls, for the two suites that compare what a
// joined call and the call uncompiled report for it. React reports a missing
// key once per parent per process, so each is a suite of its own, and both pin
// the same report.
import { act, createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, vi } from 'vitest'
import { createNode, Div, type NodeInstance } from '@src/main.js'
import { __resetStaticCss } from '@src/util/static-css.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Props = Record<string, unknown>

/** The factory the lists call. */
export const Panel = createNode('section', { padding: 8, css: { color: 'rgb(200, 0, 0)' } } as never) as unknown as (props?: Props) => NodeInstance

/**
 * Renders an unkeyed list of two calls made by `make`, and checks the page and
 * what was reported: React's missing key report, once, naming the page.
 * @param make Makes one call.
 */
export function expectListReport(make: (props: Props) => NodeInstance): void {
  __resetStaticCss()
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  act(() =>
    root.render(
      createElement(function ListPage() {
        return Div({ children: [[make({ padding: 4, children: 'a' }), make({ padding: 4, children: 'b' })]] }).render() as ReactElement
      }),
    ),
  )
  act(() =>
    root.render(
      createElement(function ListPage() {
        return Div({ children: [[make({ padding: 4, children: 'a' }), make({ padding: 4, children: 'c' })]] }).render() as ReactElement
      }),
    ),
  )
  const messages = error.mock.calls.map(args => args.map(String).join(' '))
  const html = container.innerHTML
  act(() => root.unmount())
  error.mockRestore()
  expect({ html, messages }).toEqual({
    html: '<div><section class="css-1dgdtqnt1xkm6">a</section><section class="css-1dgdtqnt1xkm6">c</section></div>',
    messages: [
      'Each child in a list should have a unique "key" prop.%s%s See https://react.dev/link/warning-keys for more information. \n\nCheck the render method of `ListPage`. ',
    ],
  })
}
