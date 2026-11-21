// @vitest-environment jsdom
//
// The owner React records for a built element passed to a node. The node rebuilds
// the element where it renders, so React names the component that called
// `.render()` as its owner, not the component that built it. The README's Debug
// Mode section says so; this pins the shape it describes.
import { Div } from '@src/main.js'
import { createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { expect, it } from 'vitest'

type DevElement = ReactElement & { _owner?: { type?: unknown } | null }

it('names the component calling `.render()` as the owner of a built element child', () => {
  let built: DevElement | undefined
  let rendered: DevElement | undefined
  function Panel({ el }: { el: DevElement }) {
    const out = Div({ children: el }).render() as unknown as { props: { children: DevElement } }
    rendered = out.props.children
    return out as unknown as ReactElement
  }
  function App() {
    built = createElement('ul', null, createElement('li', null, 'a')) as DevElement
    return createElement(Panel, { el: built })
  }
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  flushSync(() => root.render(createElement(App)))
  flushSync(() => root.unmount())
  expect(built?._owner?.type).toBe(App)
  expect(rendered?._owner?.type).toBe(Panel)
})
