// A styled element resolves its css where it renders and renders its host beside
// a leaf that inserts the rule, only while the sheet lacks it.
import { act, cloneElement, createElement, type ReactElement, type ReactNode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { Div, Node, Span, ThemeProvider } from '@src/main.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
})

function mount(tree: ReactNode) {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  act(() => root.render(tree))
  return { container, root }
}

/** The rules in the document whose selector is `.name`. */
const rulesFor = (name: string): number =>
  [...document.querySelectorAll('style')]
    .flatMap(style => [...(style.sheet?.cssRules ?? [])])
    .filter(rule => (rule as CSSStyleRule).selectorText === `.${name}`).length

interface Fiber {
  type: unknown
  child: Fiber | null
  sibling: Fiber | null
}

/** How many fibers below `container` render a component named `name`. */
const fibersNamed = (container: Element, name: string): number => {
  const key = Object.keys(container).find(k => k.startsWith('__reactContainer$')) as string
  let count = 0
  const walk = (fiber: Fiber | null): void => {
    for (; fiber; fiber = fiber.sibling) {
      if (typeof fiber.type === 'function' && (fiber.type as { name?: string }).name === name) count++
      walk(fiber.child)
    }
  }
  walk((container as unknown as Record<string, { stateNode: { current: Fiber } }>)[key].stateNode.current.child)
  return count
}

const childrenOf = (element: ReactElement): ReactElement[] => (element.props as { children: ReactElement[] }).children

describe('the styled elements of one render', () => {
  it('give css repeated among them one class and one rule, each beside a leaf on the mount that first inserts it, and none after', () => {
    const tree = () => Div({ children: Array.from({ length: 40 }, (_, i) => Span(`n${i}`, { key: i, padding: '3px 1px' })) }).render()
    const first = mount(tree())
    const classes = new Set([...first.container.querySelectorAll('span')].map(span => span.className))
    expect(classes.size).toBe(1)
    expect(rulesFor([...classes][0])).toBe(1)
    expect(fibersNamed(first.container, 'RuleInsertion')).toBe(40)
    expect(getComputedStyle(first.container.querySelector('span') as HTMLElement).paddingTop).toBe('3px')
    const again = mount(tree())
    expect(fibersNamed(again.container, 'RuleInsertion')).toBe(0)
    expect(rulesFor([...classes][0])).toBe(1)
  })

  it('give an element cloned from one of them the same class', () => {
    const element = Div({
      children: [Span('a', { key: 'a', id: 'a', padding: '3px 3px' }), Span('b', { key: 'b', id: 'b', padding: '3px 3px' })],
    }).render()
    const [first, second] = childrenOf(element)
    const clone = cloneElement(second, { id: 'clone' } as never)
    const { container } = mount(createElement('div', null, first, clone))
    expect(container.querySelector('#clone')?.className).toBe(container.querySelector('#a')?.className)
  })

  it('resolve an element rendered again, unchanged, against the theme it is rendered under then', () => {
    const shared = Div({
      children: [Span('a', { key: 'a', id: 'a', color: 'theme.colors.only' }), Span('b', { key: 'b', id: 'b', color: 'theme.colors.only' })],
    }).render()
    let setTokens!: (tokens: object) => void
    function App() {
      const [tokens, set] = useState<object>({ colors: { other: 'rgb(1, 1, 1)' } })
      setTokens = set
      return ThemeProvider({ tokens, modes: ['light'], defaultMode: 'light', children: shared } as never).render()
    }
    const { container } = mount(createElement(App))
    act(() => setTokens({ colors: { only: 'rgb(2, 2, 2)' } }))
    expect(getComputedStyle(container.querySelector('#b') as HTMLElement).color).toBe('rgb(2, 2, 2)')
    expect(container.querySelector('#a')?.className).toBe(container.querySelector('#b')?.className)
  })

  it('resolve the same css against the theme each one renders under, for a key that reads it', () => {
    const css = { '@media (min-width: theme.bp.md)': { color: 'rgb(3, 3, 3)' } }
    const provide = (md: string, child: ReactNode) =>
      ThemeProvider({ tokens: { bp: { md } }, modes: ['light'], defaultMode: 'light', children: child } as never).render()
    // One walk's elements, placed by a component under two providers.
    const Split = ({ children }: { children: ReactElement[] }) => createElement('div', null, provide('100px', children[0]), provide('900px', children[1]))
    const { container } = mount(
      Node(Split, { children: [Span('narrow', { key: 'n', id: 'narrow', css }), Span('wide', { key: 'w', id: 'wide', css })] }).render(),
    )
    const narrow = container.querySelector('#narrow')?.className as string
    const wide = container.querySelector('#wide')?.className as string
    expect(narrow).not.toBe(wide)
    const rules = [...document.querySelectorAll('style')].flatMap(style => [...(style.sheet?.cssRules ?? [])]).map(rule => rule.cssText)
    expect(rules.some(text => text.includes('100px') && text.includes(narrow))).toBe(true)
    expect(rules.some(text => text.includes('900px') && text.includes(wide))).toBe(true)
  })

  it('insert a rule into every cache the same css renders under', () => {
    const other = createCache({ key: 'other' })
    const { container } = mount(
      Div({
        children: [
          Span('a', { key: 'a', id: 'a', padding: '4px 4px' }),
          Node(CacheProvider, { key: 'c', value: other, children: Span('b', { id: 'b', padding: '4px 4px' }) }),
        ],
      }).render(),
    )
    expect(container.querySelector('#b')?.className.startsWith('other-')).toBe(true)
    expect(getComputedStyle(container.querySelector('#a') as HTMLElement).paddingTop).toBe('4px')
    expect(getComputedStyle(container.querySelector('#b') as HTMLElement).paddingTop).toBe('4px')
  })
})
