// @vitest-environment jsdom
//
// When and in what order the browser inserts extracted rules, with Emotion as the
// oracle: each case renders one tree twice, once with every node's css on the
// runtime path and once with the same rules extracted, and the static sheet must
// end with the classes in the order Emotion's sheet ends with the rules.
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { act, createElement, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Div, Node, type NodeInstance } from '@src/main.js'
import { __resetStaticCss, __setStaticCssSpeedy, registerStaticCss } from '@src/util/static-css.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** The nodes a case may use, each with a rule of its own: `order: <position>`. */
const NAMES = ['a', 'b', 'c', 'd', 'e', 'f'] as const
type Name = (typeof NAMES)[number]
const classOf = (name: Name) => `mn-00000000000${name}0`
const orderOf = (name: Name) => NAMES.indexOf(name) + 1

/** Makes one styled node, on the runtime path or extracted. */
type Make = (name: Name, children?: unknown) => NodeInstance
/** Renders a case into a fresh root under the case's cache. */
type Render = (tree: (node: Make) => NodeInstance) => void
/** What a case does: one render, or several commits. */
type Steps = (render: Render) => void

const runtimeNode: Make = (name, children) => Div({ css: { order: orderOf(name) }, children } as never)
const extractedNode: Make = (name, children) => Div({ __meo$: 2, __meo$s: classOf(name), children } as never)

let roots: Root[] = []

/** The names, in the order a sheet's rules hold them. */
const namesIn = (elements: Iterable<HTMLStyleElement>) =>
  [...elements]
    .flatMap(element => [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText))
    .map(text => NAMES.find(name => text.includes(classOf(name)) || new RegExp(`order: ${orderOf(name)}\\b`).test(text)))
    .filter((name): name is Name => name !== undefined)

/** Runs `steps` with `make` under a fresh cache keyed `key`. */
function run(key: string, make: Make, steps: Steps): void {
  document.head.innerHTML = ''
  const cache = createCache({ key, speedy: true })
  steps(tree => {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    act(() => root.render(createElement(CacheProvider, { value: cache }, tree(make).render() as ReactElement)))
  })
}

/** The order Emotion's sheet ends with when every node's css is on the runtime path. */
function emotionOrder(steps: Steps): Name[] {
  run('oracle', runtimeNode, steps)
  return namesIn(document.head.querySelectorAll<HTMLStyleElement>('style[data-emotion^="oracle"]'))
}

/** The order the static sheet ends with when the same rules are extracted. */
function staticOrder(steps: Steps): Name[] {
  run('css', extractedNode, steps)
  return namesIn(document.head.querySelectorAll<HTMLStyleElement>('style[data-meonode-static="1"]'))
}

const once =
  (tree: (node: Make) => NodeInstance): Steps =>
  render =>
    render(tree)

beforeEach(() => {
  __resetStaticCss()
  __setStaticCssSpeedy(true)
  registerStaticCss(
    'order',
    NAMES.map(name => [1, classOf(name), `.${classOf(name)}{order:${orderOf(name)};}`] as const),
  )
})
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  document.body.innerHTML = ''
  __setStaticCssSpeedy()
})

describe('in the browser, extracted rules go in as Emotion inserts the same rules', () => {
  it.each<[string, Steps]>([
    ['a chain of nested nodes', once(node => node('a', node('b', node('c'))))],
    ['siblings with children', once(node => Div({ children: [node('a', node('b')), node('c', [node('d'), node('e')])] }))],
    ['nodes under unstyled hosts', once(node => node('a', Div({ children: [node('b'), Div({ children: node('c') })] })))],
    [
      // A later commit appends after what an earlier one inserted, whatever its tree.
      'a parent mounted around a child an earlier commit inserted',
      render => {
        let wrap = () => {}
        render(node => {
          const App = () => {
            const [wrapped, setWrapped] = useState(false)
            wrap = () => setWrapped(true)
            const child = node('b')
            return (wrapped ? node('a', child) : child).render() as ReactElement
          }
          return Node(App)
        })
        act(() => wrap())
      },
    ],
    [
      'a class an earlier render inserted',
      render => {
        render(node => node('c'))
        render(node => node('a', node('c')))
      },
    ],
  ])('%s', (_, steps) => {
    const expected = emotionOrder(steps)
    expect(expected.length).toBeGreaterThan(1)
    expect(staticOrder(steps)).toEqual(expected)
  })

  // One `StaticInsertion` per render, at the end of its topmost host: a render
  // nested in another goes in before it, where Emotion puts the outer render's
  // nodes that began before the nested one first. Two nodes' own rules never
  // compete, so this shows only for a rule of one render reaching the other's
  // elements; pinned so a change to it is seen.
  it('inserts a render nested in another before it, where Emotion interleaves them', () => {
    const steps = once(node => {
      const Nested = () => node('b', node('c')).render() as ReactElement
      return node('a', [Node(Nested, { key: 'n' }), node('d')])
    })
    expect(emotionOrder(steps)).toEqual(['a', 'b', 'c', 'd'])
    expect(staticOrder(steps)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('inserts nothing for a class no rendered node uses', () => {
    expect(staticOrder(once(node => node('a')))).toEqual(['a'])
  })
})
