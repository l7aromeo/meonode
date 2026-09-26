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
import styled from '@emotion/styled'
import Button from '@mui/material/Button'
import { describe, expect, it } from 'vitest'
import StyledRenderer from '@src/components/styled-renderer.client.js'
import { createNode, Div, Node } from '@src/main.js'

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
 * A class the element is handed and its own css compose in one Emotion cache,
 * as they do on the client: one class, with the incoming styles last so they win.
 * Rendering a function component through `StyledRenderer` on the server is what
 * puts the caller's class in that cache; compiled anywhere else, the element
 * would keep two classes the client never produces.
 */
describe('a styled element handed a class outside Next', () => {
  function Card({ className, children }: { className?: string; children?: string }) {
    return Div({ className, 'data-testid': 'conflict', color: 'rgb(0, 128, 128)', children }).render()
  }
  const CardNode = createNode(Card)
  const StyledButton = styled('button')({ color: 'blue' })

  const provided = (element: ReactElement) => createElement(CacheProvider, { value: createCache({ key: 'css' }) }, element)
  const classesOf = (html: string, marker: string) =>
    [...html.matchAll(/<[a-z]+ [^>]*>/g)]
      .find(tag => tag[0].includes(marker))?.[0]
      .match(/class="([^"]*)"/)?.[1]
      .split(' ') ?? []
  const emotionClasses = (classes: string[]) => classes.filter(name => /^css-/.test(name))
  const ruleOf = (html: string, className: string) => html.match(new RegExp(`\\.${className}\\{[^}]*\\}`))?.[0] ?? ''
  /** Every Emotion class in the markup has a rule in it. */
  const undefinedClasses = (html: string) =>
    [...new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap(match => match[1].split(' ')))].filter(name => /^css-/.test(name) && !html.includes(`.${name}{`))

  const card = () => Div({ children: CardNode({ css: { color: 'rgb(255, 165, 0)' }, children: 'conflict' }) }).render() as ReactElement
  const styledButton = () => Node(StyledButton, { padding: 8, 'data-testid': 'styled', children: 'x' } as never).render() as ReactElement
  const muiButton = () => Node(Button, { padding: 8, 'data-testid': 'mui', children: 'x' } as never).render() as ReactElement

  it.each([
    ['without a provider', card],
    ['under a CacheProvider', () => provided(card())],
  ])('composes a function component’s css into its styled child, %s', (_, render) => {
    const html = renderToString(render())
    const classes = classesOf(html, 'data-testid="conflict"')
    const rule = ruleOf(html, classes[0])

    expect(classes).toHaveLength(1)
    expect(rule.lastIndexOf('color:rgb(255, 165, 0)')).toBeGreaterThan(rule.lastIndexOf('color:rgb(0, 128, 128)'))
    expect(undefinedClasses(html)).toEqual([])
  })

  it.each([
    ['an Emotion styled component, without a provider', styledButton, 'data-testid="styled"'],
    ['an Emotion styled component, under a CacheProvider', () => provided(styledButton()), 'data-testid="styled"'],
    ['a MUI component, without a provider', muiButton, 'data-testid="mui"'],
    ['a MUI component, under a CacheProvider', () => provided(muiButton()), 'data-testid="mui"'],
  ])('lets %s merge its own styles with the ones it is given', (_, render, marker) => {
    const html = renderToString(render())
    const classes = emotionClasses(classesOf(html, marker))

    expect(classes).toHaveLength(1)
    expect(ruleOf(html, classes[0])).toContain('padding:8px')
    expect(undefinedClasses(html)).toEqual([])
  })
})
