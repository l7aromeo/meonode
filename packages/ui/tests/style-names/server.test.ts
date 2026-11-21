// @vitest-environment node
//
// Two different styles in a server render with no registry, on one page and in
// renders one after another in the same process, as two requests: each element's
// class must carry its own rule.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Div } from '@src/main.js'
import { FIRST, SECOND } from '@tests/style-names/pair.js'

/** The class of the element marked `side`, and the rule text the page carries for it. */
function ruleFor(html: string, side: string): { className: string; rule: string } {
  const className = html.match(new RegExp(`<div[^>]*data-side="${side}"[^>]*>`))?.[0].match(/class="([^"]*)"/)?.[1] ?? ''
  const rule = [...html.matchAll(/<style[^>]*>([^<]*)<\/style>/g)]
    .map(match => match[1])
    .filter(text => text.includes(`.${className}{`))
    .join('')
  return { className, rule }
}

describe('two different styles on one server-rendered page', () => {
  it('give each element a class whose rule carries its own colour', () => {
    const html = renderToString(
      Div({
        children: [
          Div({ key: 'first', 'data-side': 'first', css: FIRST, children: 'first' }),
          Div({ key: 'second', 'data-side': 'second', css: SECOND, children: 'second' }),
        ],
      }).render(),
    )
    const first = ruleFor(html, 'first')
    const second = ruleFor(html, 'second')

    expect(first.className).not.toBe(second.className)
    expect(first.rule).toContain('color:#02ab73')
    expect(second.rule).toContain('color:#031998')
    expect(second.rule).not.toContain('color:#02ab73')
  })
})

describe('a server render after another rendered a different style', () => {
  it('carries its own rule for its element', () => {
    renderToString(Div({ 'data-side': 'first', css: FIRST, children: 'first' }).render())
    const second = ruleFor(renderToString(Div({ 'data-side': 'second', css: SECOND, children: 'second' }).render()), 'second')

    expect(second.rule).toContain('color:#031998')
    expect(second.rule).not.toContain('color:#02ab73')
  })
})
