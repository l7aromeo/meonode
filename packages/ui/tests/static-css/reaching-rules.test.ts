// @vitest-environment jsdom
//
// Which of two rules of equal specificity wins on one element, when one node's
// rule reaches another node's element and that node has a rule of its own, with
// Emotion as the oracle: each case renders one tree with every node's css on the
// runtime path, then with the same rules extracted, mounted in the browser, sent
// by the server and hydrated. The extracted rules must give the element the
// colour Emotion's rules give it.
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { act, createElement, type ReactElement } from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Div, Node, Span, type NodeInstance } from '@src/main.js'
import { NodeUtil } from '@src/util/node.util.js'
import { __resetStaticCss, __setStaticCssSpeedy, registerStaticCss, type StaticCssRule } from '@src/util/static-css.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** The buckets the compiler puts a rule in. */
const REACHING = 0
const BASE = 1
const AT_RULE = 3
const OWN_SELECTOR = 4

/** One node's style: its css on the runtime path, and the same rule as the compiler extracts it. */
interface Style {
  css: Record<string, unknown>
  rule: StaticCssRule
}

const style = (name: string, css: Record<string, unknown>, bucket: number, body: (selector: string) => string): Style => {
  const className = `mn-00000000000${name}`
  return { css, rule: [bucket, className, body(`.${className}`)] }
}

/** Props that give a node its style, on the runtime path or extracted. */
type Styled = (style: Style) => Record<string, unknown>
const runtimeStyled: Styled = ({ css }) => ({ css })
const extractedStyled: Styled = ({ rule }) => ({ __meo$: 2, __meo$s: rule[1] })

interface Case {
  styles: Style[]
  /** The tree; the element whose colour is compared has the id `target`. */
  tree: (styled: Styled) => NodeInstance
}

const RED = 'rgb(200, 0, 0)'
const BLUE = 'rgb(0, 0, 200)'

// Each pair below is of equal specificity, so the later of the two rules wins.
const parentAll = style('pa', { '& > *': { color: RED } }, REACHING, s => `${s}>*{color:${RED};}`)
const childColor = style('cc', { color: BLUE }, BASE, s => `${s}{color:${BLUE};}`)
const childMedia = style('cm', { '@media (min-width: 1px)': { color: BLUE } }, AT_RULE, s => `@media (min-width: 1px){${s}{color:${BLUE};}}`)
const parentChild = style('pc', { '& .child': { color: RED } }, REACHING, s => `${s} .child{color:${RED};}`)
const inWrapper = style('iw', { '.wrapper &': { color: BLUE } }, OWN_SELECTOR, s => `.wrapper ${s}{color:${BLUE};}`)
const nextItem = style('ni', { '& + .item': { color: RED } }, REACHING, s => `${s}+.item{color:${RED};}`)
const ownColor = style('oc', { color: RED }, BASE, s => `${s}{color:${RED};}`)
const inOuter = style('io', { '.outer &': { color: RED } }, OWN_SELECTOR, s => `.outer ${s}{color:${RED};}`)
// `*:has(&)`, as a selector that starts with `:` is the node's own: stylis reads `:has(&)` as `&:has(&)`.
const hasNode = style('hn', { '*:has(&)': { color: BLUE } }, OWN_SELECTOR, s => `*:has(${s}){color:${BLUE};}`)
const xHasNode = style('xh', { '.x:has(&)': { color: BLUE } }, OWN_SELECTOR, s => `.x:has(${s}){color:${BLUE};}`)

const CASES: Record<string, Case> = {
  // A parent's & > * against its child's own colour.
  S3: { styles: [parentAll, childColor], tree: styled => Div({ ...styled(parentAll), children: Span('child', { id: 'target', ...styled(childColor) }) }) },
  // The same, with the child's colour under an at-rule.
  'S3 under @media': {
    styles: [parentAll, childMedia],
    tree: styled => Div({ ...styled(parentAll), children: Span('child', { id: 'target', ...styled(childMedia) }) }),
  },
  // A sibling's & + .item against the next sibling's own .wrapper &, the next
  // sibling a component's render.
  S1: {
    styles: [nextItem, inWrapper],
    tree: styled => {
      const Item = () => Div({ id: 'target', className: 'item', ...styled(inWrapper), children: 'item' }).render() as ReactElement
      return Div({ className: 'wrapper', children: [Span('before', { key: 'b', ...styled(nextItem) }), Node(Item, { key: 'i' })] })
    },
  },
  // A descendant's :has(&) against its ancestor's own colour: the rule styles an
  // element that renders before its node, so it goes after the atomics.
  'backward against an atomic': {
    styles: [ownColor, hasNode],
    tree: styled => Div({ id: 'target', ...styled(ownColor), children: Span('descendant', styled(hasNode)) }),
  },
  // The same against the ancestor's own selector rule, both in the last bucket.
  'backward against an own selector rule': {
    styles: [inOuter, xHasNode],
    tree: styled =>
      Div({ className: 'outer', children: Div({ id: 'target', className: 'x', ...styled(inOuter), children: Span('descendant', styled(xHasNode)) }) }),
  },
  // A parent's & .child against a component child's own .wrapper &, the child
  // passed to the parent's component as its children.
  R4: {
    styles: [parentChild, inWrapper],
    tree: styled => {
      const Child = () => Span('child', { id: 'target', className: 'child', ...styled(inWrapper) }).render() as ReactElement
      const Parent = ({ children }: { children?: ReactElement }) => Div({ className: 'wrapper', ...styled(parentChild), children }).render() as ReactElement
      return Node(Parent, { children: createElement(Child) })
    },
  },
}

/**
 * The colour the document's rules give `#target`: the last of the style rules
 * whose selector matches it, in document order, every at-rule taken as applying.
 * Each case's two rules are of equal specificity, so this is the cascade's answer.
 */
function targetColor(): string | undefined {
  const target = document.getElementById('target')!
  let color: string | undefined
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        if (target.matches(rule.selectorText) && rule.style.getPropertyValue('color')) color = rule.style.getPropertyValue('color')
      } else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules)
    }
  }
  for (const element of document.querySelectorAll('style')) if (element.sheet) visit(element.sheet.cssRules)
  return color
}

let roots: Root[] = []

function register(testCase: Case): void {
  __resetStaticCss()
  registerStaticCss(
    'reaching',
    testCase.styles.map(({ rule }) => rule),
  )
}

/** Mounts the case in the browser with `styled`, under a fresh cache. */
function mount(testCase: Case, styled: Styled): string | undefined {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  register(testCase)
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  roots.push(root)
  act(() => root.render(createElement(CacheProvider, { value: createCache({ key: 'css' }) }, testCase.tree(styled).render() as ReactElement)))
  return targetColor()
}

const page = (testCase: Case, cache?: ReturnType<typeof createCache>) => {
  const body = testCase.tree(extractedStyled).render() as ReactElement
  return createElement(
    'html',
    null,
    createElement('head', null),
    createElement('body', null, cache ? createElement(CacheProvider, { value: cache }, body) : body),
  )
}

/** Renders the extracted case on the server and loads it, before and after it hydrates. */
function serverRendered(testCase: Case): { firstPaint: string | undefined; hydrated: string | undefined } {
  register(testCase)
  NodeUtil.isServer = true
  let html: string
  try {
    html = renderToString(page(testCase))
  } finally {
    NodeUtil.isServer = false
  }
  document.open()
  document.write(html)
  document.close()
  const firstPaint = targetColor()
  register(testCase)
  act(() => void hydrateRoot(document, page(testCase, createCache({ key: 'css', container: document.head }))))
  return { firstPaint, hydrated: targetColor() }
}

beforeEach(() => __setStaticCssSpeedy(true))
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  NodeUtil.isServer = false
  __resetStaticCss()
  __setStaticCssSpeedy()
})

describe('a rule reaching another node’s element ties with that node’s own rule as in Emotion', () => {
  describe.each(Object.entries(CASES))('%s', (_, testCase) => {
    it('mounted in the browser', () => {
      const expected = mount(testCase, runtimeStyled)
      expect(expected).toBe(BLUE)
      expect(mount(testCase, extractedStyled)).toBe(expected)
    })

    it('sent by the server, before and after it hydrates', () => {
      const expected = mount(testCase, runtimeStyled)
      expect(serverRendered(testCase)).toEqual({ firstPaint: expected, hydrated: expected })
    })
  })

  // Two rules of one bucket from two renders, one nested in the other: the
  // nested render's go in first, where Emotion puts the outer node's first. Here
  // a component's :has(&) loses to its ancestor's own selector rule, which
  // Emotion inserts before it. Pinned so a change to it is seen.
  it('puts a nested render’s rule before its ancestor’s rule of the same bucket, where Emotion puts it after', () => {
    const testCase: Case = {
      styles: [inOuter, xHasNode],
      tree: styled => {
        const Descendant = () => Span('descendant', styled(xHasNode)).render() as ReactElement
        return Div({ className: 'outer', children: Div({ id: 'target', className: 'x', ...styled(inOuter), children: Node(Descendant) }) })
      },
    }
    expect(mount(testCase, runtimeStyled)).toBe(BLUE)
    expect(mount(testCase, extractedStyled)).toBe(RED)
    expect(serverRendered(testCase)).toEqual({ firstPaint: RED, hydrated: RED })
  })
})
