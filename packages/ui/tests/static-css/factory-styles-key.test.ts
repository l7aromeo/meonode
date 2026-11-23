// @vitest-environment jsdom
//
// A factory whose default `css` holds a `styles` key that holds no string,
// which Emotion reserves for serialized styles: the runtime leaves the key out
// and reports it once, where the factory is first called. A compiled call of
// such a factory must report the same, so the compiler leaves it to the
// runtime's merge, which checks the factory's `css`. The call sites below are
// literals, so a compiled run of this suite compiles them as an app's.
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createNode } from '@src/main.js'
import { __resetThemeDiagnostics } from '@src/util/theme-diagnostics.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let warnings: string[] = []
let originalWarn: typeof console.warn
beforeEach(() => {
  __resetThemeDiagnostics()
  warnings = []
  originalWarn = console.warn
  console.warn = (...args: unknown[]) => void warnings.push(String(args[0]))
})
afterEach(() => {
  console.warn = originalWarn
  document.body.innerHTML = ''
})

const Box = createNode('div', { css: { color: 'rgb(200, 0, 0)', styles: { margin: 1 } } })

it('reports a factory’s reserved `styles` key once, and applies the rest of its css', () => {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  act(() =>
    root.render(
      createElement(function Page() {
        return Box({ padding: 4, children: [Box({ key: 'a', padding: 5 })] }).render()
      }),
    ),
  )
  const reported = warnings.filter(text => text.includes('`styles` key'))
  expect(reported).toEqual([
    '[MeoNode] `css` has a `styles` key that holds no string. Emotion reserves `styles` for serialized styles, such as what `css()` returns, and would write that object from it alone, so the key was left out and the rest of the object applies. Rename the key.',
  ])
  const outer = container.firstElementChild as HTMLElement
  expect([getComputedStyle(outer).color, getComputedStyle(outer).padding, getComputedStyle(outer).margin]).toEqual(['rgb(200, 0, 0)', '4px', '0px'])
  act(() => root.unmount())
})
