// @vitest-environment jsdom
//
// A subtree built once and held by a component re-renders as React renders it:
// its elements are rewrapped each time the component renders, so a plain
// component inside it renders again with every render of the component holding
// it, wherever it sits below a styled element, as it does below an unstyled host
// and as a direct child.
import { act, createElement, type ReactNode, useReducer, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { Div, Node, Span, ThemeProvider } from '@src/main.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
})

const TOKENS = { colors: { primary: 'rgb(10, 20, 30)' } }

it('renders a plain component below a styled element again with each render of the component holding it', () => {
  const renders: Record<string, number> = {}
  const Counted = ({ name }: { name: string }) => {
    renders[name] = (renders[name] ?? 0) + 1
    return createElement('i', null, name)
  }
  const Pass = ({ children }: { children?: ReactNode }) => children
  const plain = (name: string) => createElement(Counted, { key: name, name })
  let rerender!: () => void
  let setTokens!: (tokens: typeof TOKENS) => void
  function Holder({ children }: { children?: ReactNode }) {
    const [tokens, set] = useState(TOKENS)
    const [, bump] = useReducer((n: number) => n + 1, 0)
    rerender = bump
    setTokens = set
    return ThemeProvider({ tokens, modes: ['light'], defaultMode: 'light', children } as never).render()
  }
  const held = Div({
    children: [
      Div({ key: 'only', css: { padding: 3 }, children: plain('onlyChild') }),
      Span(['a', plain('inArray')], { key: 'array', margin: 4 }),
      Div({ key: 'nested', color: 'theme.colors.primary', children: ['n', [plain('inNestedArray')]] }),
      Div({ key: 'component', padding: 5, children: Node(Pass, { children: plain('componentChild') }) }),
      Div({ key: 'host', children: plain('belowUnstyledHost') }),
      plain('direct'),
    ],
  }).render()
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  act(() => root.render(createElement(Holder, null, held)))
  act(() => rerender())
  act(() => rerender())
  act(() => setTokens({ colors: { primary: 'rgb(9, 8, 7)' } }))
  const four = { onlyChild: 4, inArray: 4, inNestedArray: 4, componentChild: 4, belowUnstyledHost: 4, direct: 4 }
  expect(renders).toEqual(four)
  act(() => root.unmount())
})
