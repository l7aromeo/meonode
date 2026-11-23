// The pages the carrier suites share: counters around a conditional or a
// spread, and a generated list of items each holding a component, each written
// for how a node gets its css, keyed or not, and the runs that toggle them and
// record each step's counters, rules and `.render()` shape. React reports a
// missing key once per process for each host's name, so a run that counts the
// key warnings has a file of its own.
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { serializeStyles } from '@emotion/serialize'
import { act, Children, createElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { vi } from 'vitest'
import { Button, Div, Node, Span, type NodeInstance } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { shaped } from './_render-shapes.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export type Css = Record<string, unknown>

/** Props for a node of `css`: compiled to its name, and with `carrier` marked to carry what follows it. */
export type Style = (css: Css, options?: { carrier?: boolean; runtime?: boolean }) => Record<string, unknown>
export const runtimeStyle: Style = css => ({ css })
export const compiledStyle: Style = (css, options) => {
  if (options?.runtime) return { css }
  const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const { name, styles } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  registerStaticCss(`m-${name}`, [[name, styles]])
  return { __meo$: 2, __meo$n: name, ...(options?.carrier && { __meo$r: 1 }) }
}
export const carrier = { carrier: true }

/** A component holding a count under its label, which a remount resets. */
export function Counter({ label }: { label: string }) {
  const [count, setCount] = useState(0)
  return Button(`${label}:${count}`, { 'data-counter': label, onClick: () => setCount(value => value + 1) }).render() as ReactElement
}
export const counter = (label: string, keyed: boolean) => Node(Counter, keyed ? { label, key: label } : { label })
export const keyOf = (keyed: boolean, key: string) => (keyed ? { key } : {})

export const RED = { color: 'rgb(200, 0, 0)' }
export const BLUE = { color: 'rgb(0, 0, 200)' }
export const GRID = { display: 'grid' }

/**
 * The toggle matrix: each case's page for whether its conditional or spread is
 * in. The compiled page marks the host, which begins its render, and the first
 * named node after each component that may render one.
 */
export const CASES: Record<string, (on: boolean, style: Style, keyed: boolean) => NodeInstance> = {
  'a conditional static host, then a counter': (on, style, keyed) =>
    Div({ ...style(GRID, carrier), children: [on && Div({ ...keyOf(keyed, 's'), ...style(RED) }), counter('b', keyed)] }),
  'a conditional counter, then a counter': (on, style, keyed) => Div({ ...style(GRID, carrier), children: [on && counter('x', keyed), counter('b', keyed)] }),
  'a conditional counter, a static host, a counter': (on, style, keyed) =>
    Div({ ...style(GRID, carrier), children: [on && counter('x', keyed), Span('h', { ...keyOf(keyed, 'h'), ...style(BLUE, carrier) }), counter('b', keyed)] }),
  'a counter, a conditional static host, a counter': (on, style, keyed) =>
    Div({ ...style(GRID, carrier), children: [counter('x', keyed), on && Div({ ...keyOf(keyed, 's'), ...style(RED, carrier) }), counter('b', keyed)] }),
  'a counter, the spread, a counter': (on, style, keyed) =>
    Div({
      ...style(GRID, carrier),
      children: [counter('x', keyed), ...(on ? [Div({ ...keyOf(keyed, 's'), ...style(RED, carrier) }), counter('b', keyed)] : []), counter('y', keyed)],
    }),
  'a counter, a static host, the spread, a counter': (on, style, keyed) =>
    Div({
      ...style(GRID, carrier),
      children: [
        counter('x', keyed),
        Span('h', { ...keyOf(keyed, 'h'), ...style(BLUE, carrier) }),
        ...(on ? [counter('b', keyed), Div({ ...keyOf(keyed, 's'), ...style(RED, carrier) })] : []),
        counter('y', keyed),
      ],
    }),
  'a counter, then the spread at the end': (on, style, keyed) =>
    Div({
      ...style(GRID, carrier),
      children: [counter('x', keyed), ...(on ? [Div({ ...keyOf(keyed, 's'), ...style(RED, carrier) }), counter('b', keyed)] : [])],
    }),
  'a counter, a static host, then the spread at the end': (on, style, keyed) =>
    Div({
      ...style(GRID, carrier),
      children: [
        counter('x', keyed),
        Span('h', { ...keyOf(keyed, 'h'), ...style(BLUE, carrier) }),
        ...(on ? [Div({ ...keyOf(keyed, 's'), ...style(RED) }), counter('b', keyed)] : []),
      ],
    }),
  'the spread first, of the counter type, then a counter': (on, style, keyed) =>
    Div({
      ...style(GRID, carrier),
      children: [...(on ? [counter('b', keyed), Div({ ...keyOf(keyed, 's'), ...style(RED, carrier) })] : []), counter('y', keyed)],
    }),
}

/** What `.render()` gives a user to inspect: each child's kind and key, nested, as `Children` sees them. */
export function shapeOf(node: ReactNode): unknown {
  if (!isValidElement(node)) return node === null || node === undefined || typeof node === 'boolean' ? String(node) : typeof node
  const children = (node.props as { children?: ReactNode }).children
  return {
    key: node.key,
    count: Children.count(children),
    isArray: Array.isArray(children),
    children: Children.map(children, child => (isValidElement(child) ? { key: child.key } : child === null ? 'null' : typeof child)) ?? null,
  }
}

/** The root a run renders into, unmounted by the run or by `unmountCarrierRoot` after a failure. */
let root: Root | undefined
/** Unmounts a run's root that a failed assertion left mounted. */
export function unmountCarrierRoot(): void {
  if (root) act(() => root!.unmount())
  root = undefined
}

export const counters = () => [...document.querySelectorAll<HTMLButtonElement>('[data-counter]')].map(button => button.textContent)
export const rules = () =>
  [...document.head.querySelectorAll<HTMLStyleElement>('style[data-emotion^="css"]')].flatMap(element =>
    [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText),
  )

/** Toggles the case four times from `initially`, counting each counter up after each step; returns what each step showed. */
function runUnshaped(page: (on: boolean) => NodeInstance, initially: boolean) {
  __resetStaticCss()
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  let toggle = () => {}
  const shapes: unknown[] = []
  function Page() {
    const [on, setOn] = useState(initially)
    toggle = () => setOn(value => !value)
    const element = page(on).render() as ReactElement
    shapes.push(shapeOf(element))
    return element
  }
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  root = createRoot(document.body.appendChild(document.createElement('div')))
  act(() => root!.render(createElement(CacheProvider, { value: createCache({ key: 'css', speedy: true }) }, createElement(Page))))
  const countUp = () => {
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-counter]')) act(() => button.click())
  }
  const steps = [{ counters: counters(), rules: rules() }]
  countUp()
  for (let i = 0; i < 4; i++) {
    act(() => toggle())
    steps.push({ counters: counters(), rules: rules() })
    countUp()
  }
  act(() => root!.unmount())
  root = undefined
  const keyWarnings = error.mock.calls.filter(call => /key/i.test(String(call[0]))).length
  error.mockRestore()
  return { steps, shapes, keyWarnings }
}
export const run = shaped(runUnshaped)

/** The generated list's page, for the ids it holds. */
export const shade = (id: string) => `rgb(${id.charCodeAt(0)}, 0, 0)`
export const listPage = (style: Style, ids: string[], keyed: boolean) =>
  Div({
    ...style(GRID, carrier),
    __meo$list: true,
    children: ids.map(id =>
      Div({
        ...keyOf(keyed, id),
        ...style({ order: id.charCodeAt(0) }, carrier),
        children: [Span('t', { ...keyOf(keyed, 't'), ...style({ '& + button': { color: shade(id) } }) }), counter(id, keyed)],
      }),
    ),
  } as never)
export const SEQUENCE = [
  ['a', 'b', 'c'],
  ['a', 'b', 'c', 'd'],
  ['b', 'c', 'd'],
  ['d', 'c', 'b'],
  ['e', 'd', 'c', 'b'],
]

export const runList = shaped((style: Style, keyed: boolean) => {
  __resetStaticCss()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  let setIds: (ids: string[]) => void = () => {}
  const shapes: unknown[] = []
  // React reports a missing key once per parent's name, so each run's page has its own.
  const name = `Page${style === compiledStyle ? 'Compiled' : style === runtimeStyle ? 'Runtime' : 'Unmarked'}${keyed ? 'Keyed' : ''}`
  const Page = {
    [name]: function () {
      const [ids, set] = useState(SEQUENCE[0])
      setIds = set
      const element = listPage(style, ids, keyed).render() as ReactElement
      shapes.push(shapeOf(element))
      return element
    },
  }[name]
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  root = createRoot(document.body.appendChild(document.createElement('div')))
  act(() => root!.render(createElement(CacheProvider, { value: createCache({ key: 'css', speedy: true }) }, createElement(Page))))
  const steps = []
  for (const ids of SEQUENCE) {
    act(() => setIds(ids))
    steps.push({ counters: counters(), rules: rules() })
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-counter]')) act(() => button.click())
  }
  act(() => root!.unmount())
  root = undefined
  const keyWarnings = error.mock.calls.filter(call => /key/i.test(String(call[0]))).length
  error.mockRestore()
  return { steps, shapes, keyWarnings }
})
