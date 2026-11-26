// @vitest-environment jsdom
//
// Where the generated-list report learns React's call into a component: the
// frame that called the first of MeoNode's own components to render, which has
// to be React's, whichever of them renders first.
import { beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Renders the element `build` makes, with fresh copies of every module, and returns the place learned. */
async function learnedFrom(build: (createElement: typeof import('react').createElement) => Promise<unknown>): Promise<string | undefined> {
  const { act, createElement } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { __generatedListState } = await import('@src/util/generated-list.util.js')
  const element = await build(createElement)
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(element as never))
  await act(async () => root.unmount())
  return __generatedListState().componentCaller
}

/** A caller in React's renderer, whose frames are the only ones a place can be. */
const REACT_DOM = /\/react-dom\/cjs\/react-dom-client\.[a-z]+\.js:\d+:\d+$/

describe('the place React calls a component from', () => {
  beforeEach(() => vi.resetModules())

  it('is learned from a styled node', async () => {
    const caller = await learnedFrom(async createElement => {
      const { default: StyledRenderer } = await import('@src/components/styled-renderer.client.js')
      return createElement(StyledRenderer as never, { element: 'div', css: { color: 'red' }, children: 'x' })
    })
    expect(caller).toMatch(REACT_DOM)
  })

  // It calls `StyledRenderer` as a function, so `StyledRenderer`'s own caller
  // is this component, not React.
  it('is learned from a compiled styled node, not from the component that calls StyledRenderer', async () => {
    const caller = await learnedFrom(async createElement => {
      const { default: CompiledStyledRenderer } = await import('@src/components/compiled-styled-renderer.client.js')
      return createElement(CompiledStyledRenderer as never, { element: 'div', css: { color: 'red' }, children: 'x' })
    })
    expect(caller).toMatch(REACT_DOM)
  })

  it('is learned from a theme provider', async () => {
    const caller = await learnedFrom(async createElement => {
      const { default: ThemeProvider } = await import('@src/components/theme-provider.client.js')
      return createElement(ThemeProvider, { tokens: {}, modes: ['light'], defaultMode: 'light', children: 'x' } as never)
    })
    expect(caller).toMatch(REACT_DOM)
  })
})
