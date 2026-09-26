// @vitest-environment node
//
// The same host tags as `server-host-tags.test.ts`, rendered on the server with
// the client build of React: a client component's server render, or a server
// render outside the RSC layer. The client hydrates these through
// `StyledRenderer`, so the server renders them through it too.
import { type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import StyledRenderer from '@src/components/styled-renderer.client.js'
import { Div } from '@src/main.js'

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
