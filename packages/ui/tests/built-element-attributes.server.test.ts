// @vitest-environment node
//
// On the server, a host element that has already been built keeps the
// attributes and inline style it was built with wherever it is placed, and with
// Emotion disabled renders as the same node unbuilt renders there, as it does in
// the browser (built-element-attributes.test.ts).
import { createElement, type ReactElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { Div, Img, Node, Span, ThemeProvider } from '@src/main.js'

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

/** The attributes of the element whose id is `built`, from server markup, in name order. */
const attributesOf = (tree: unknown, only?: readonly string[]) => {
  const tag = renderToString(tree as ReactElement).match(/<(img|rect)\b[^>]*\bid="built"[^>]*>/)?.[0] ?? ''
  return [...tag.matchAll(/\s([a-z-]+)="([^"]*)"/g)]
    .map(([, name, value]) => [name, value] as const)
    .filter(([name]) => only === undefined || only.includes(name))
    .map(([name, value]) => `${name}=${value}`)
    .sort()
}

/** The attributes a second classification would turn into css. */
const BUILT = ['width', 'height', 'fill', 'style']

const Pass = ({ children }: { children?: ReactNode }) => children as ReactElement

describe.each(builtElements)('%s, rendered on the server', (_, build, unbuilt) => {
  it.each<[string, () => unknown]>([
    ['a child of a host node', () => Div({ children: build() }).render()],
    ['in a children array', () => Div({ children: ['before', build()] }).render()],
    ['a child of a component node', () => Node(Pass, { children: build() }).render()],
    ['returned by a render prop', () => Div({ children: () => build() }).render()],
    [
      'a child of a ThemeProvider',
      () => ThemeProvider({ tokens: { primary: 'rgb(1, 2, 3)' }, modes: ['light'], defaultMode: 'light', children: build() } as never).render(),
    ],
  ])('as %s keeps its attributes', (_, tree) => {
    expect(attributesOf(tree(), BUILT)).toEqual(attributesOf(build(), BUILT))
  })

  it('as a child of a node with Emotion disabled renders as the same node unbuilt renders there', () => {
    expect(attributesOf(Div({ disableEmotion: true, children: build() }).render())).toEqual(
      attributesOf(Div({ disableEmotion: true, children: unbuilt() as never }).render()),
    )
  })
})

describe('a theme token in the inline style of a built host element, rendered on the server below a ThemeProvider', () => {
  it('renders as its variable', () => {
    const tree = ThemeProvider({
      tokens: { primary: 'rgb(1, 2, 3)' },
      modes: ['light'],
      defaultMode: 'light',
      children: Span('x', { id: 'built', style: { color: 'theme.primary' } }).render(),
    } as never).render()
    expect(renderToString(tree as ReactElement)).toMatch(/<span id="built" style="color:var\(--meonode-theme-primary\)">/)
  })
})
