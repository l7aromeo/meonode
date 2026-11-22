// @vitest-environment jsdom
//
// The slots among a compiled host's children sit at fixed positions: one before
// each written child that may be a component, and for a spread one where it
// begins and none inside or after it. React pairs unkeyed children by their
// index, so a slot that moved with what a conditional or a spread held would
// remount the siblings after it. Each case toggles a conditional or a spread in
// and out and reads which components kept their state, compiled against the same
// tree with every node's css on the runtime path, where no slot exists, and the
// rules each step leaves in the head. The same cases written out in source run
// against a snapshot of the uncompiled run, so the compiled suite checks the
// slots the compiler itself marks.
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { serializeStyles } from '@emotion/serialize'
import { act, createElement, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button, Div, Node, Span, type NodeInstance } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { styledRenders } from './_styled-renders.js'

vi.mock('@src/components/styled-renderer.client.js', async original => (await import('./_styled-renders.js')).countingStyledRenderer(original as never))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Css = Record<string, unknown>

/** Props for a node of `css`: as the compiler emits them for a static node, or as written. */
type Style = (css: Css) => Record<string, unknown>
const runtimeStyle: Style = css => ({ css })
const compiledStyle: Style = css => {
  const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const { name, styles } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  registerStaticCss(`m-${name}`, [[name, styles]])
  return { __meo$: 2, __meo$n: name }
}

/** A component holding a count under its label, which a remount resets. */
function Counter({ label }: { label: string }) {
  const [count, setCount] = useState(0)
  return Button(`${label}:${count}`, { 'data-counter': label, onClick: () => setCount(value => value + 1) }).render() as ReactElement
}

/** A counter, keyed by its label when `keyed`. */
const counter = (label: string, keyed: boolean) => Node(Counter, keyed ? { label, key: label } : { label })

/**
 * A case: the host's written children for `on`, and the slots the compiler
 * marks among them.
 */
interface Case {
  children: (on: boolean, style: Style, keyed: boolean) => unknown[]
  slots: number[]
}

/** A key for a written child, only when the case's children are keyed. */
const keyOf = (keyed: boolean, key: string) => (keyed ? { key } : {})

const RED = { color: 'rgb(200, 0, 0)' }
const BLUE = { color: 'rgb(0, 0, 200)' }

const CASES: Record<string, Case> = {
  'a conditional static host, then a counter': {
    slots: [1],
    children: (on, style, keyed) => [on && Div({ ...keyOf(keyed, 's'), ...style(RED) }), counter('b', keyed)],
  },
  'a conditional counter, then a counter': {
    slots: [0, 1],
    children: (on, _, keyed) => [on && counter('x', keyed), counter('b', keyed)],
  },
  'a conditional counter, a static host, a counter': {
    slots: [0, 2],
    children: (on, style, keyed) => [on && counter('x', keyed), Span('h', { ...keyOf(keyed, 'h'), ...style(BLUE) }), counter('b', keyed)],
  },
  'a counter, a conditional static host, a counter': {
    slots: [0, 2],
    children: (on, style, keyed) => [counter('x', keyed), on && Div({ ...keyOf(keyed, 's'), ...style(RED) }), counter('b', keyed)],
  },
  'a counter, the spread, a counter': {
    slots: [1],
    children: (on, style, keyed) => [
      counter('x', keyed),
      ...(on ? [Div({ ...keyOf(keyed, 's'), ...style(RED) }), counter('b', keyed)] : []),
      counter('y', keyed),
    ],
  },
  'a counter, a static host, the spread, a counter': {
    slots: [2],
    children: (on, style, keyed) => [
      counter('x', keyed),
      Span('h', { ...keyOf(keyed, 'h'), ...style(BLUE) }),
      ...(on ? [counter('b', keyed), Div({ ...keyOf(keyed, 's'), ...style(RED) })] : []),
      counter('y', keyed),
    ],
  },
  'a counter, then the spread at the end': {
    slots: [1],
    children: (on, style, keyed) => [counter('x', keyed), ...(on ? [Div({ ...keyOf(keyed, 's'), ...style(RED) }), counter('b', keyed)] : [])],
  },
  'a counter, a static host, then the spread at the end': {
    slots: [2],
    children: (on, style, keyed) => [
      counter('x', keyed),
      Span('h', { ...keyOf(keyed, 'h'), ...style(BLUE) }),
      ...(on ? [Div({ ...keyOf(keyed, 's'), ...style(RED) }), counter('b', keyed)] : []),
    ],
  },
  'the spread first, of the counter type, then a counter': {
    slots: [0],
    children: (on, style, keyed) => [...(on ? [counter('b', keyed), Div({ ...keyOf(keyed, 's'), ...style(RED) })] : []), counter('y', keyed)],
  },
}

let root: Root | undefined
beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = undefined
  vi.restoreAllMocks()
})

/** The counters on the page and what each holds, in document order. */
const counters = () => [...document.querySelectorAll<HTMLButtonElement>('[data-counter]')].map(button => button.textContent)

/** The rules of the cache's style elements in the head, in order. */
const rules = () =>
  [...document.head.querySelectorAll<HTMLStyleElement>('style[data-emotion^="css"]')].flatMap(element =>
    [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText),
  )

/** What the page shows after a step: the counters, and the rules in the head. */
const snapshot = () => ({ counters: counters(), rules: rules() })

/**
 * Renders the case with the spread `initially` in or out, gives each counter a
 * count, then toggles the spread four times, counting each counter up after each.
 * @returns What the counters held after each step, and the key warnings React gave.
 */
function run(testCase: Case, compiled: boolean, keyed: boolean, initially: boolean): { steps: ReturnType<typeof snapshot>[]; keyWarnings: number } {
  // Only what this case registers: the written cases' styles are the compiler's, registered as the file loads.
  __resetStaticCss()
  const style = compiled ? compiledStyle : runtimeStyle
  return runPage(
    on =>
      Div({
        ...style({ display: 'grid' }),
        ...(compiled ? { __meo$: 2, __meo$p: testCase.slots } : {}),
        children: testCase.children(on, style, keyed) as never,
      }),
    initially,
  )
}

/** As {@link run}, for a page that `host` builds for whether its conditional or spread is in. */
function runPage(host: (on: boolean) => NodeInstance, initially: boolean): { steps: ReturnType<typeof snapshot>[]; keyWarnings: number } {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  let toggle = () => {}
  function Page() {
    const [on, setOn] = useState(initially)
    toggle = () => setOn(value => !value)
    return host(on).render() as ReactElement
  }
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  root = createRoot(document.body.appendChild(document.createElement('div')))
  act(() => root!.render(createElement(CacheProvider, { value: createCache({ key: 'css', speedy: true }) }, createElement(Page))))
  const countUp = () => {
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-counter]')) act(() => button.click())
  }
  const steps = [snapshot()]
  countUp()
  steps.push(snapshot())
  for (let i = 0; i < 4; i++) {
    act(() => toggle())
    steps.push(snapshot())
    countUp()
  }
  act(() => root!.unmount())
  root = undefined
  const keyWarnings = error.mock.calls.filter(call => /key/i.test(String(call[0]))).length
  error.mockRestore()
  return { steps, keyWarnings }
}

// The markers here stand in for the compiler's; the compiled suite adds its own, so runs only the written cases.
describe.skipIf(process.env.MEONODE_COMPILED === '1').each([
  ['unkeyed', false],
  ['keyed', true],
] as const)('%s counters around a conditional or a spread keep their state as their runtime twins do', (_, keyed) => {
  describe.each([
    ['with it in at first', true],
    ['with it out at first', false],
  ] as const)('%s', (__, initially) => {
    it.each(Object.entries(CASES))('%s', (___, testCase) => {
      styledRenders()
      const expected = run(testCase, false, keyed, initially)
      const runtimeRenders = styledRenders()
      expect(expected.keyWarnings).toBe(0)
      expect(expected.steps.at(-1)!.rules.length).toBeGreaterThan(0)
      expect(run(testCase, true, keyed, initially)).toEqual(expected)
      // The compiled tree's named nodes took the named path.
      expect(styledRenders()).toBeLessThan(runtimeRenders)
    })
  })
})

/** The cases above written out, for the compiler to mark; `k` keys a child only when the case is keyed. */
const WRITTEN: Record<string, (on: boolean, k: (key: string) => string | undefined) => NodeInstance> = {
  'a conditional static host, then a counter': (on, k) =>
    Div({ css: { display: 'grid' }, children: [on && Div({ key: k('s'), css: { color: 'rgb(200, 0, 0)' } }), Node(Counter, { label: 'b', key: k('b') })] }),
  'a conditional counter, then a counter': (on, k) =>
    Div({ css: { display: 'grid' }, children: [on && Node(Counter, { label: 'x', key: k('x') }), Node(Counter, { label: 'b', key: k('b') })] }),
  'a conditional counter, a static host, a counter': (on, k) =>
    Div({
      css: { display: 'grid' },
      children: [
        on && Node(Counter, { label: 'x', key: k('x') }),
        Span('h', { key: k('h'), css: { color: 'rgb(0, 0, 200)' } }),
        Node(Counter, { label: 'b', key: k('b') }),
      ],
    }),
  'a counter, a conditional static host, a counter': (on, k) =>
    Div({
      css: { display: 'grid' },
      children: [
        Node(Counter, { label: 'x', key: k('x') }),
        on && Div({ key: k('s'), css: { color: 'rgb(200, 0, 0)' } }),
        Node(Counter, { label: 'b', key: k('b') }),
      ],
    }),
  'a counter, the spread, a counter': (on, k) =>
    Div({
      css: { display: 'grid' },
      children: [
        Node(Counter, { label: 'x', key: k('x') }),
        ...(on ? [Div({ key: k('s'), css: { color: 'rgb(200, 0, 0)' } }), Node(Counter, { label: 'b', key: k('b') })] : []),
        Node(Counter, { label: 'y', key: k('y') }),
      ],
    }),
  'a counter, a static host, the spread, a counter': (on, k) =>
    Div({
      css: { display: 'grid' },
      children: [
        Node(Counter, { label: 'x', key: k('x') }),
        Span('h', { key: k('h'), css: { color: 'rgb(0, 0, 200)' } }),
        ...(on ? [Node(Counter, { label: 'b', key: k('b') }), Div({ key: k('s'), css: { color: 'rgb(200, 0, 0)' } })] : []),
        Node(Counter, { label: 'y', key: k('y') }),
      ],
    }),
  'a counter, then the spread at the end': (on, k) =>
    Div({
      css: { display: 'grid' },
      children: [
        Node(Counter, { label: 'x', key: k('x') }),
        ...(on ? [Div({ key: k('s'), css: { color: 'rgb(200, 0, 0)' } }), Node(Counter, { label: 'b', key: k('b') })] : []),
      ],
    }),
  'a counter, a static host, then the spread at the end': (on, k) =>
    Div({
      css: { display: 'grid' },
      children: [
        Node(Counter, { label: 'x', key: k('x') }),
        Span('h', { key: k('h'), css: { color: 'rgb(0, 0, 200)' } }),
        ...(on ? [Div({ key: k('s'), css: { color: 'rgb(200, 0, 0)' } }), Node(Counter, { label: 'b', key: k('b') })] : []),
      ],
    }),
  'the spread first, of the counter type, then a counter': (on, k) =>
    Div({
      css: { display: 'grid' },
      children: [
        ...(on ? [Node(Counter, { label: 'b', key: k('b') }), Div({ key: k('s'), css: { color: 'rgb(200, 0, 0)' } })] : []),
        Node(Counter, { label: 'y', key: k('y') }),
      ],
    }),
}

describe.each([
  ['unkeyed', false],
  ['keyed', true],
] as const)('%s counters, written out, keep their state as the uncompiled run did', (_, keyed) => {
  describe.each([
    ['with it in at first', true],
    ['with it out at first', false],
  ] as const)('%s', (__, initially) => {
    it.each(Object.entries(WRITTEN))('%s', (___, page) => {
      const result = runPage(on => page(on, key => (keyed ? key : undefined)), initially)
      expect(result.steps.at(-1)!.rules.length).toBeGreaterThan(0)
      // The snapshot is the uncompiled run's: the compiled suite must match it.
      expect(result.steps).toMatchSnapshot()
      // Compiled, the compiler marks children holding a spread as a generated
      // list, so React checks the siblings written beside it for keys too.
      if (process.env.MEONODE_COMPILED !== '1') expect(result.keyWarnings).toBe(0)
    })
  })
})
