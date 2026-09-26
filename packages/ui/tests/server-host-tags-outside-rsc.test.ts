// @vitest-environment node
//
// The same host tags as `server-host-tags.test.ts`, rendered on the server with
// the client build of React: a client component's server render, or a server
// render outside the RSC layer. The client hydrates these through
// `StyledRenderer`, so the server renders them through it too.
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { describe, expect, it } from 'vitest'
import StyledRenderer from '@src/components/styled-renderer.client.js'
import { createNode, Div } from '@src/main.js'

const HOVERABLE = { color: 'rgb(106, 4, 15)', '&:hover': { color: 'rgb(0, 0, 255)' }, '@media (min-width: 600px)': { padding: 8 } }

describe('a host tag rendered on the server outside the RSC layer', () => {
  it('stays a StyledRenderer element', () => {
    const element = Div({ key: 'row', css: HOVERABLE, children: 'x' }).render() as ReactElement

    expect(element.type).toBe(StyledRenderer)
    expect(element.key).toBe('row')
  })

  it('renders an emotion class, with no rule emitted beside it', () => {
    const html = renderToString(Div({ css: HOVERABLE, children: 'x' }).render() as never)

    expect(html).toMatch(/class="css-[a-z0-9]+"/)
    expect(html).not.toContain('meonode-css-')
    expect(html).not.toContain('data-precedence="meonode"')
  })
})

/**
 * The documented limitation. A component's `css` is compiled into a class when
 * the node renders, in a cache of the package's own, and the component's host
 * then renders through `StyledRenderer` under Emotion's cache. The class is not
 * registered there, so the two stay separate classes on the server, where the
 * client composes them into one with the incoming class winning. A
 * `CacheProvider` does not change this: the class is compiled outside React
 * context, so the provider's cache never sees it.
 */
describe('a className passed into a styled host outside Next', () => {
  function Card({ className, children }: { className?: string; children?: string }) {
    return Div({ className, 'data-testid': 'conflict', color: 'rgb(0, 128, 128)', children }).render()
  }
  const CardNode = createNode(Card)
  const tree = () => Div({ children: CardNode({ css: { color: 'rgb(255, 165, 0)' }, children: 'conflict' }) }).render()
  const classOf = (html: string) => html.match(/class="([^"]*)" data-testid="conflict"/)?.[1]

  it.each([
    ['without a provider', tree],
    ['under a CacheProvider', () => createElement(CacheProvider, { value: createCache({ key: 'css' }) }, tree())],
  ])('stays two classes on the server %s, the component’s own rule written last', (_, render) => {
    const html = renderToString(render() as never)
    const classes = classOf(html)?.split(' ') ?? []

    expect(classes).toHaveLength(2)
    const [incoming, own] = classes
    expect(html.indexOf(`.${own}{`)).toBeGreaterThan(html.indexOf(`.${incoming}{`))
    expect(html).toMatch(new RegExp(`\\.${incoming}\\{[^}]*color:rgb\\(255, 165, 0\\)`))
    expect(html).toMatch(new RegExp(`\\.${own}\\{[^}]*color:rgb\\(0, 128, 128\\)`))
  })
})
