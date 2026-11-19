// A host element that has already been built, by `.render()` or by React's
// `createElement`, has its props classified: what is an attribute and what is
// css was decided when it was built. Placed as a child of a node, it keeps the
// attributes and the inline style it was built with, wherever it is placed, and
// with Emotion disabled it renders as the same node unbuilt renders there.
import { createElement, type ReactElement, type ReactNode } from 'react'
import { cleanup, render } from '@testing-library/react'
import { Div, Img, Node, Span, ThemeProvider } from '@src/main.js'

afterEach(cleanup)

/** Elements with attributes a styling engine would read as css, each beside the same node unbuilt. */
const builtElements: [string, () => ReactElement, () => unknown][] = [
  [
    'an img built by a node, with `props` and `style`',
    () => Img({ id: 'built', alt: 'a', props: { width: 40, height: 30 }, style: { opacity: 0.5 } }).render() as ReactElement,
    () => Img({ id: 'built', alt: 'a', props: { width: 40, height: 30 }, style: { opacity: 0.5 } }),
  ],
  [
    'an svg rect built by a node, with `props`',
    () => Node('rect', { id: 'built', props: { width: 10, height: 20, fill: 'red' } }).render() as ReactElement,
    () => Node('rect', { id: 'built', props: { width: 10, height: 20, fill: 'red' } }),
  ],
  [
    'an img built by createElement',
    () => createElement('img', { id: 'built', alt: 'b', width: 40, height: 30, style: { opacity: 0.5 } }),
    () => Img({ id: 'built', alt: 'b', props: { width: 40, height: 30 }, style: { opacity: 0.5 } }),
  ],
]

/** The attributes named like css, and the inline style, of the element whose id is `built`. */
const rendered = (tree: ReactNode) => {
  const element = render(tree as ReactElement).container.querySelector('#built') as HTMLElement
  const result = {
    width: element.getAttribute('width'),
    height: element.getAttribute('height'),
    fill: element.getAttribute('fill'),
    style: element.getAttribute('style'),
  }
  cleanup()
  return result
}

const Pass = ({ children }: { children?: ReactNode }) => children as ReactElement

describe.each(builtElements)('%s, placed as a child', (_, build) => {
  const own = () => rendered(build())

  it('of a host node keeps its attributes', () => {
    expect(rendered(Div({ children: build() }).render())).toEqual(own())
  })

  it('in a children array keeps its attributes', () => {
    expect(rendered(Div({ children: ['before', build()] }).render())).toEqual(own())
  })

  it('in a nested children array keeps its attributes', () => {
    expect(rendered(Div({ children: ['before', [build()]] }).render())).toEqual(own())
  })

  it('of a component node keeps its attributes', () => {
    expect(rendered(Node(Pass, { children: build() }).render())).toEqual(own())
  })

  it('returned by a render prop keeps its attributes', () => {
    expect(rendered(Div({ children: () => build() }).render())).toEqual(own())
  })

  it('returned in an array by a render prop keeps its attributes', () => {
    expect(rendered(Div({ children: [() => [build()]] }).render())).toEqual(own())
  })

  it('of a ThemeProvider keeps its attributes', () => {
    const provided = ThemeProvider({ tokens: { primary: 'rgb(1, 2, 3)' }, modes: ['light'], defaultMode: 'light', children: build() } as never)
    expect(rendered(provided.render())).toEqual(own())
  })
})

describe('the inline style of a built host element placed below a node', () => {
  it('stays inline, its theme token a variable, with no class', () => {
    const provided = ThemeProvider({
      tokens: { primary: 'rgb(1, 2, 3)' },
      modes: ['light'],
      defaultMode: 'light',
      children: Span('x', { id: 'built', style: { color: 'theme.primary' } }).render(),
    } as never)
    const element = render(provided.render() as ReactElement).container.querySelector('#built') as HTMLElement
    expect(element.getAttribute('style')).toBe('color: var(--meonode-theme-primary);')
    expect(element.getAttribute('class')).toBeNull()
  })
})

// A styled node renders its `style` inline beside its class, wherever it is placed,
// so a `css` rule for the same property, `&:hover` among them, does not override it.
describe('a styled node with `style` and a `css` hover rule for the same property', () => {
  const styled = () => Span('x', { id: 'built', style: { color: 'rgb(1, 1, 1)' }, css: { '&:hover': { color: 'rgb(2, 2, 2)' } } })

  it.each<[string, () => unknown]>([
    ['at the render root', () => styled().render()],
    ['built, then placed below a node', () => Div({ children: styled().render() }).render()],
    [
      'built, then given to a ThemeProvider',
      () => ThemeProvider({ tokens: {}, modes: ['light'], defaultMode: 'light', children: styled().render() } as never).render(),
    ],
  ])('keeps the style inline and the hover rule on its class, %s', (_, tree) => {
    const element = render(tree() as ReactElement).container.querySelector('#built') as HTMLElement
    expect(element.getAttribute('style')).toBe('color: rgb(1, 1, 1);')
    const rules = [...document.querySelectorAll('style')].flatMap(style => [...(style.sheet?.cssRules ?? [])]).map(rule => rule.cssText)
    const className = [...element.classList].find(name => name.startsWith('css-'))
    expect(rules).toContain(`.${className}:hover { color: rgb(2, 2, 2); }`)
  })
})
