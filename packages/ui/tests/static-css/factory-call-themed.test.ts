// @vitest-environment jsdom
//
// A joined call of an imported factory whose defaults hold a theme token in a
// key, such as `@media (width < theme.breakpoint.compact)`. A key needs the
// theme's concrete value, so its style is resolved where the theme is, once per
// site for each theme that gives the key tokens other values, and the element
// gets the class the call uncompiled gets under that theme. Props are passed as
// variables, so a compiled run of this suite leaves the uncompiled twins as
// they are.
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __meoFactoryCall, createNode, Div, ThemeProvider, type FactoryCallSite, type NodeInstance } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { __resetStaticCss } from '@src/util/static-css.util.js'
import { __resetThemedText, __themedTextState } from '@src/util/themed-text.util.js'
import { STATIC_NAME_MARKER } from '@src/constant/common.const.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Props = Record<string, unknown>

const COMPACT = '@media (width < theme.breakpoint.compact)'

/** meocord's reading column, cut down: flat token values, token keys at two depths, and selectors. */
const Prose = createNode('article', {
  maxWidth: 'calc(theme.layout.prose + 2 * theme.layout.pad)',
  padding: 'theme.layout.pad',
  color: 'theme.ink',
  css: {
    [COMPACT]: { padding: 'theme.layout.padCompact' },
    '& h1': { fontSize: 'theme.type.h1', [COMPACT]: { scrollMarginTop: 'theme.layout.toolbar' } },
    '& a:focus-visible': { outline: 'theme.focus.width solid theme.ink' },
  },
} as never) as unknown as (props?: Props) => NodeInstance

const tokens = (compact: string, ink: string) => ({
  breakpoint: { compact },
  layout: { prose: '40rem', pad: '24px', padCompact: '16px', toolbar: '48px' },
  type: { h1: '32px' },
  focus: { width: '2px' },
  ink,
})
/** Two themes whose key tokens differ, and a third whose key tokens are the first's. */
const NARROW = tokens('600px', '#111')
const WIDE = tokens('900px', '#111')
const NARROW_RED = tokens('600px', '#a00')

const provide = (system: Record<string, unknown>, children: unknown) =>
  ThemeProvider({ tokens: system, modes: ['light'], defaultMode: 'light', children } as never)

/** The calls of one page: joined, as compiled output makes them, or as written. */
type Call = (props: Props) => NodeInstance
const site: FactoryCallSite = { at: 0 }
const joined: Call = props => {
  const node = __meoFactoryCall(Prose, site, props) as NodeInstance
  expect((node.props as Props)[STATIC_NAME_MARKER]).toBeDefined()
  return node
}
const plain: Call = props => Prose(props)

let roots: Root[] = []

/** A root to render pages into, again and again. */
function mountPoint(): { render: (page: () => NodeInstance) => HTMLElement } {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  roots.push(root)
  return {
    render(page) {
      act(() =>
        root.render(
          createElement(function Page() {
            return page().render() as ReactElement
          }),
        ),
      )
      return container
    },
  }
}

/** The rules the document holds for `className`, with the class written as `&`. */
function rulesOf(className: string): string[] {
  const found: string[] = []
  const visit = (rules: CSSRuleList, wrap: (text: string) => string) => {
    for (const rule of Array.from(rules)) {
      const grouping = rule as CSSGroupingRule & { selectorText?: string }
      if (grouping.cssRules && grouping.selectorText === undefined) visit(grouping.cssRules, text => wrap(`${rule.cssText.split('{')[0].trim()}{${text}}`))
      else if (grouping.selectorText?.includes(`.${className}`)) found.push(wrap(rule.cssText.replaceAll(`.${className}`, '&')))
    }
  }
  for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules, text => text)
  return found.sort()
}

/** The article's class and its rules. */
function articleOf(container: HTMLElement): { className: string; rules: string[] } {
  const article = container.querySelector('article')!
  return { className: article.className, rules: rulesOf(article.className) }
}

const props = { children: 'text', id: 'p' }
const page = (call: Call, system: Record<string, unknown>) => () => provide(system, Div({ children: call(props) }))

/** Calls of `resolveObjWithTheme` on the site's style: a style holding its key, with the call's own keys. */
let resolves: () => number

beforeEach(() => {
  __resetStaticCss()
  __resetThemedText()
  const spy = vi.spyOn(ThemeUtil, 'resolveObjWithTheme')
  resolves = () =>
    spy.mock.calls.filter(([css]) => css !== null && typeof css === 'object' && COMPACT in (css as object) && 'maxWidth' in (css as object)).length
})
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('a joined call whose defaults hold a theme token in a key', () => {
  it('renders the class the call uncompiled renders, under each theme', () => {
    for (const system of [NARROW, WIDE]) {
      const own = articleOf(mountPoint().render(page(joined, system)))
      const uncompiled = articleOf(mountPoint().render(page(plain, system)))
      expect(own).toEqual(uncompiled)
      expect(own.rules.join('\n')).toContain(`(width < ${system.breakpoint.compact})`)
    }
  })

  it('follows a theme switch, and back, as the call uncompiled does', () => {
    const own = mountPoint()
    const uncompiled = mountPoint()
    const classes: string[] = []
    for (const system of [NARROW, WIDE, NARROW]) {
      const joinedArticle = articleOf(own.render(page(joined, system)))
      expect(joinedArticle).toEqual(articleOf(uncompiled.render(page(plain, system))))
      classes.push(joinedArticle.className)
    }
    expect(classes[1]).not.toBe(classes[0])
    expect(classes[2]).toBe(classes[0])
  })

  it('takes the theme of the nearest provider, nested', () => {
    const nested = (call: Call) => () =>
      provide(
        NARROW,
        Div({
          children: [Div({ key: 'o', children: call({ ...props, id: 'outer' }) }), provide(WIDE, Div({ key: 'i', children: call({ ...props, id: 'inner' }) }))],
        }),
      )
    const read = (container: HTMLElement) => ['#outer', '#inner'].map(id => container.querySelector(id)!.className)
    const own = read(mountPoint().render(nested(joined)))
    expect(own).toEqual(read(mountPoint().render(nested(plain))))
    expect(own[0]).not.toBe(own[1])
  })

  // The join resolves the style once, with no theme, and names its text; each
  // render resolves only that text's conditions, once for each set of values.
  it('resolves its style once, and its conditions once for each theme whose key tokens differ', () => {
    const own: FactoryCallSite = { at: 0 }
    const call: Call = given => __meoFactoryCall(Prose, own, given) as NodeInstance
    expect((call(props).props as Props)[STATIC_NAME_MARKER]).toBeDefined()
    const point = mountPoint()
    for (const system of [NARROW, NARROW, WIDE, NARROW, NARROW_RED]) point.render(page(call, system))
    expect(resolves()).toBe(1)
    expect(__themedTextState().resolutions).toBe(2)
  })

  // Two conditions a theme could give one text: resolving the keys folds them
  // into one key of the object, where the text would keep two blocks, so the
  // style stays on the runtime path. Conditions that cannot meet join.
  it.each([
    ['two tokens with one value', false, { '@media (width < theme.bp.a)': { color: 'red' }, '@media (width < theme.bp.b)': { padding: 1 } }],
    ['a token and the literal it takes', false, { '@media (width < 600px)': { color: 'red' }, '@media (width < theme.bp.a)': { padding: 1 } }],
    ['a token before the literal it takes', false, { '@media (width < theme.bp.a)': { color: 'red' }, '@media (width < 600px)': { padding: 1 } }],
    ['nested conditions that may meet', false, { '& h1': { '@media (width < theme.bp.a)': { color: 'red' }, '@media (width < theme.bp.b)': { padding: 1 } } }],
    ['a value holding a brace', false, { content: '"{"', '@media (width < theme.bp.a)': { color: 'red' } }],
    ['a condition over a value', false, { '@media (width < theme.bp.a)': 'display:none' }],
    ['conditions that cannot meet', true, { '@media (width < theme.bp.a)': { color: 'red' }, '@media (width > theme.bp.b)': { padding: 1 } }],
    ['one condition at two depths', true, { '@media (width < theme.bp.a)': { color: 'red' }, '& h1': { '@media (width < theme.bp.a)': { padding: 1 } } }],
  ])('renders as the call uncompiled with %s', (_, joins, css) => {
    const Twin = createNode('div', { margin: 1, css } as never) as unknown as (props?: Props) => NodeInstance
    const own: FactoryCallSite = { at: 0 }
    const twinPage = (call: Call) => () => provide({ bp: { a: '600px', b: '600px' } }, Div({ children: call({ id: 't', children: 't' }) }))
    const read = (container: HTMLElement) => {
      const element = container.querySelector('#t')!
      return { className: element.className, rules: rulesOf(element.className) }
    }
    const joinedTwin: Call = given => __meoFactoryCall(Twin, own, given) as NodeInstance
    expect((joinedTwin({}).props as Props)[STATIC_NAME_MARKER] !== undefined).toBe(joins)
    expect(read(mountPoint().render(twinPage(joinedTwin)))).toEqual(read(mountPoint().render(twinPage(given => Twin(given)))))
  })

  // The count the cache is measured against: uncompiled, every render resolves.
  it('resolves on every render when the call is made as written', () => {
    const point = mountPoint()
    for (const system of [NARROW, NARROW, WIDE, NARROW, NARROW_RED]) point.render(page(plain, system))
    expect(resolves()).toBe(5)
  })
})
