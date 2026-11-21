// @vitest-environment node
//
// The server cache shared across renders, when two different styles are given
// one name. MeoNode's names make that practically impossible, so the test names
// styles with Emotion's own hash instead, under which these two share a name.
import { renderToString } from 'react-dom/server'
import murmur2 from '@emotion/hash'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Div } from '@src/main.js'
import { __setStyleHash } from '@src/util/style-name.util.js'
import { FIRST, SECOND } from '@tests/style-names/pair.js'

beforeEach(() => __setStyleHash(murmur2))
afterEach(() => __setStyleHash())

/** The rule text a page carries for the element marked `side`. */
function ruleFor(html: string, side: string): string {
  const className = html.match(new RegExp(`<div[^>]*data-side="${side}"[^>]*>`))?.[0].match(/class="([^"]*)"/)?.[1] ?? ''
  return [...html.matchAll(/<style[^>]*>([^<]*)<\/style>/g)]
    .map(match => match[1])
    .filter(text => text.includes(`.${className}{`))
    .join('')
}

describe('a server render after another rendered a different style under the same name', () => {
  it('carries its own rule for its element', () => {
    const first = ruleFor(renderToString(Div({ 'data-side': 'first', css: FIRST, children: 'first' }).render()), 'first')
    const second = ruleFor(renderToString(Div({ 'data-side': 'second', css: SECOND, children: 'second' }).render()), 'second')

    expect(first).toContain('color:#02ab73')
    expect(second).toContain('color:#031998')
    expect(second).not.toContain('color:#02ab73')
  })
})
