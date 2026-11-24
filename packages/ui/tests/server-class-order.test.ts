// @vitest-environment node
//
// Where a styled element's class attribute goes in the server HTML: at the place
// of the `className` prop among the element's props, as Emotion's `css` prop
// puts it, and last when no class is given. The order is the same compiled or
// not, with a cache provider or none.
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Div } from '@src/main.js'
import { IN_PLACE_STYLE_ATTRIBUTE } from '@src/constant/common.const.js'

/** The opening tag of the page's `<div>`, its class's generated name blanked. */
function divTag(element: ReactElement, provider: boolean): string {
  const html = renderToString(provider ? createElement(CacheProvider, { value: createCache({ key: 'css' }) }, element) : element)
  return html
    .replaceAll(` ${IN_PLACE_STYLE_ATTRIBUTE}=""`, '')
    .match(/<div[^>]*>/)![0]
    .replace(/css-\w+/, 'css-•')
}

describe.each([
  ['with no cache provider', false],
  ['under a cache provider', true],
])('a styled element %s', (_, provider) => {
  it('keeps its class where the className prop is, between other attributes', () => {
    expect(divTag(Div({ 'data-x': '1', className: 'a b', tabIndex: 0, css: { color: 'red' }, children: 'x' }).render() as ReactElement, provider)).toBe(
      '<div data-x="1" class="a b css-•" tabindex="0">',
    )
  })

  it('keeps its class first when className is the first prop', () => {
    expect(divTag(Div({ className: 'a b', 'data-x': '1', css: { color: 'red' }, children: 'x' }).render() as ReactElement, provider)).toBe(
      '<div class="a b css-•" data-x="1">',
    )
  })

  it('puts its class last when none is given', () => {
    expect(divTag(Div({ 'data-x': '1', tabIndex: 0, css: { color: 'red' }, children: 'x' }).render() as ReactElement, provider)).toBe(
      '<div data-x="1" tabindex="0" class="css-•">',
    )
  })
})
