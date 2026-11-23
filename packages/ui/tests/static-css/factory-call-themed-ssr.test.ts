// @vitest-environment node
//
// A joined call whose defaults hold a theme token in an at-rule's condition,
// rendered on the server for requests with different themes in one process:
// each request's page is the page the call uncompiled renders under its theme,
// markup and rules, with no theme's resolution leaking into another's.
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { __meoFactoryCall, createNode, Div, ThemeProvider, type FactoryCallSite, type NodeInstance } from '@src/main.js'
import { __resetStaticCss } from '@src/util/static-css.util.js'
import { STATIC_NAME_MARKER } from '@src/constant/common.const.js'
import { __resetThemedText } from '@src/util/themed-text.util.js'

type Props = Record<string, unknown>

const COMPACT = '@media (width < theme.breakpoint.compact)'
const Prose = createNode('article', {
  padding: 'theme.layout.pad',
  css: {
    [COMPACT]: { padding: 'theme.layout.padCompact' },
    '& h1': { fontSize: '32px', [COMPACT]: { fontSize: '24px' } },
    // A token the second theme lacks: the block is left out there, as uncompiled.
    '@media (width > theme.breakpoint.wide)': { maxWidth: '60rem' },
  },
} as never) as unknown as (props?: Props) => NodeInstance

const NARROW = { breakpoint: { compact: '600px', wide: '1400px' }, layout: { pad: '24px', padCompact: '16px' } }
const NO_WIDE = { breakpoint: { compact: '900px' }, layout: { pad: '24px', padCompact: '16px' } }

type Call = (props: Props) => NodeInstance
const site: FactoryCallSite = { at: 0 }
const joined: Call = props => {
  const node = __meoFactoryCall(Prose, site, props) as NodeInstance
  expect((node.props as Props)[STATIC_NAME_MARKER]).toBeDefined()
  return node
}
const plain: Call = props => Prose(props)

const page = (call: Call, tokens: Record<string, unknown>) =>
  createElement(function Page() {
    return ThemeProvider({
      tokens,
      modes: ['light'],
      defaultMode: 'light',
      children: Div({ children: [Div({ key: 'r', css: { order: 1 } }), call({ key: 'p', children: 'text' }), call({ key: 'q', children: 'more' })] }),
    } as never).render() as ReactElement
  })

const STYLE_ELEMENT = /<style data-emotion="([^"]*)"[^>]*>(.*?)<\/style>/g
/** The page's markup without its style elements, and the rules they hold, in order. */
function read(html: string): { markup: string; rules: string[] } {
  const rules: string[] = []
  for (const [, , text] of html.matchAll(STYLE_ELEMENT)) for (const rule of text.split(/(?<=\})(?=[.@])/)) if (rule) rules.push(rule)
  return { markup: html.replace(STYLE_ELEMENT, ''), rules }
}

beforeEach(() => {
  __resetStaticCss()
  __resetThemedText()
})

describe('a joined call with a theme token in a condition, on the server', () => {
  it('renders each request under its own theme, as the call uncompiled, requests interleaved', () => {
    const pages: { markup: string; rules: string[] }[] = []
    for (const tokens of [NARROW, NO_WIDE, NARROW, NO_WIDE]) {
      const own = read(renderToString(page(joined, tokens)))
      expect(own).toEqual(read(renderToString(page(plain, tokens))))
      pages.push(own)
    }
    expect(pages[0].rules.join('')).toContain('(width < 600px)')
    expect(pages[0].rules.join('')).toContain('(width > 1400px)')
    expect(pages[1].rules.join('')).toContain('(width < 900px)')
    expect(pages[1].rules.join('')).not.toContain('width >')
    expect(pages[2]).toEqual(pages[0])
    expect(pages[3]).toEqual(pages[1])
  })

  it('renders as the call uncompiled under a cache provider', () => {
    const under = (call: Call, tokens: Record<string, unknown>) => createElement(CacheProvider, { value: createCache({ key: 'app' }) }, page(call, tokens))
    for (const tokens of [NARROW, NO_WIDE]) expect(read(renderToString(under(joined, tokens)))).toEqual(read(renderToString(under(plain, tokens))))
  })
})
