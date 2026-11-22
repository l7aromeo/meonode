// @vitest-environment jsdom
//
// A compiled node whose style holds values known only at run time: the compiler
// registers the text around each value as a template, and the call site carries
// the values as `toCssValue` writes them. Filled in, the template is the node's
// whole style, named as the runtime names its css, so the node renders the class
// and puts the rule in the sheet in the order its css would.
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { serializeStyles } from '@emotion/serialize'
import { act, createElement, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Div, Span, type NodeInstance } from '@src/main.js'
import { serializedTextOf, templated } from './_template.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Renders `make`'s element from a component, where an app's walk runs and reads its cache. */
const inRender = (make: () => ReactElement): ReactElement =>
  createElement(function Page() {
    return make()
  })

type Css = Record<string, unknown>

/** Props a node of `css` gets: `css` itself, or as the compiler emits it. */
type Style = (css: Css, holes?: string[]) => Record<string, unknown>
const runtimeStyle: Style = css => ({ css })
const compiledStyle: Style = (css, holes = []) => {
  if (holes.length > 0) return templated(css, holes)
  const text = serializedTextOf(css)
  const { name } = nameStyles(serializeStyles([text] as never))
  registerStaticCss(`m-${name}`, [[name, text]])
  return { __meo$: 2, __meo$n: name }
}

let roots: Root[] = []
beforeEach(() => __resetStaticCss())
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  __resetStaticCss()
  vi.restoreAllMocks()
})

/** Renders `tree` under a fresh cache; returns the elements' classes and the sheet's rules, in order. */
function run(tree: (style: Style) => NodeInstance, style: Style) {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  __resetStaticCss()
  const cache = createCache({ key: 'css', speedy: true })
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  roots.push(root)
  act(() =>
    root.render(
      createElement(
        CacheProvider,
        { value: cache },
        inRender(() => tree(style).render() as ReactElement),
      ),
    ),
  )
  return {
    // No marker or internal prop reaches the element.
    attributes: [...document.body.querySelectorAll('*')].flatMap(element => element.getAttributeNames().filter(name => name.includes('meo'))),
    classes: [...document.body.querySelectorAll('[data-n]')].map(element => `${element.getAttribute('data-n')}: ${element.className}`),
    rules: [...document.head.querySelectorAll<HTMLStyleElement>('style[data-emotion^="css"]')].flatMap(element =>
      [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText),
    ),
  }
}

const CASES: Record<string, (style: Style) => NodeInstance> = {
  'a percentage width': style => Div({ 'data-n': 'w', ...style({ width: `${37}%`, color: 'rgb(0, 0, 200)' }, ['width']) }),
  'a number given its unit, and a second hole': style =>
    Div({ 'data-n': 'h', ...style({ height: 12 * 2, marginTop: 3, color: 'red' }, ['height', 'marginTop']) }),
  'templated, named and runtime nodes interleaved': style =>
    Div({
      'data-n': 'r',
      children: [
        Div({ key: 1, 'data-n': '1', ...style({ width: `${10}%` }, ['width']) }),
        Div({ key: 2, 'data-n': '2', css: { order: 2 } }),
        Div({ key: 3, 'data-n': '3', ...style({ order: 3 }) }),
        Div({
          key: 4,
          'data-n': '4',
          ...style({ width: `${20}%` }, ['width']),
          children: Span('s', { 'data-n': '5', ...style({ width: `${10}%` }, ['width']) }),
        }),
      ],
    }),
}

describe('a node filled from a template', () => {
  it.each(Object.entries(CASES))('renders as its css would: %s', (_, tree) => {
    const expected = run(tree, runtimeStyle)
    expect(expected.rules.length).toBeGreaterThan(0)
    expect(run(tree, compiledStyle)).toEqual(expected)
  })

  it('follows its value when it changes, as its css would', () => {
    const steps = (style: Style) => {
      document.head.innerHTML = ''
      document.body.innerHTML = ''
      __resetStaticCss()
      let grow = () => {}
      function Bar() {
        const [progress, setProgress] = useState(10)
        grow = () => setProgress(value => value + 15)
        return Div({ 'data-n': 'bar', ...style({ width: `${progress}%` }, ['width']) }).render() as ReactElement
      }
      const root = createRoot(document.body.appendChild(document.createElement('div')))
      roots.push(root)
      act(() => root.render(createElement(CacheProvider, { value: createCache({ key: 'css', speedy: true }) }, createElement(Bar))))
      act(() => grow())
      act(() => grow())
      return {
        className: document.querySelector('[data-n]')!.className,
        rules: [...document.head.querySelectorAll<HTMLStyleElement>('style[data-emotion^="css"]')].flatMap(element =>
          [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText),
        ),
      }
    }
    const expected = steps(runtimeStyle)
    expect(expected.rules.some(rule => rule.includes('width: 40%'))).toBe(true)
    expect(steps(compiledStyle)).toEqual(expected)
  })

  it('renders unstyled and says so in development when its template is not registered', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const element = Div({ __meo$: 2, __meo$t: ['t-missing', '1px'] } as never).render() as ReactElement<{ className?: string }>
    expect(element.props.className).toBeUndefined()
    expect(error.mock.calls.some(call => String(call[0]).includes('t-missing'))).toBe(true)
  })
})
