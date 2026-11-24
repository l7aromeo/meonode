// @vitest-environment node
//
// Where a server render writes each element's styles: with no cache that
// collects them, Emotion writes a `<style>` in place, right before the element
// whose rules it holds, and the browser reads the page with them there until
// the client moves them to the head. Structural selectors count those
// elements, so `& > :first-child` or `& + *` match by where they are. A named
// node, marked as a carrier or not, must write its `<style>` where its runtime
// twin does: the server HTML is the same, every `<style>` in its place, and
// each `<style>` it writes in place says so (IN_PLACE_STYLE_ATTRIBUTE).
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { Div, Span, type NodeInstance } from '@src/main.js'
import { __resetStaticCss } from '@src/util/static-css.util.js'
import { IN_PLACE_STYLE_ATTRIBUTE } from '@src/constant/common.const.js'
import { compiledStyle, runtimeStyle, type Style } from './_carrier-pages.js'

afterEach(() => __resetStaticCss())

/** A rule held apart, so its node stays on the runtime path on both sides. */
const RUNTIME = { '&': { outlineOffset: '1px' } }

const CASES: Record<string, (style: Style) => NodeInstance> = {
  // The structural-hydrate parity case: a parent's rule, then a named child, then a runtime one.
  'a named child after its parent’s rule, before a runtime sibling': style =>
    Div({
      ...style({ '& > :first-child': { color: 'rgb(200, 0, 0)' } }),
      children: [Div({ key: 's', ...style({ padding: 2 }), children: 'named' }), Div({ key: 'r', ...style(RUNTIME, { runtime: true }), children: 'runtime' })],
    }),
  'a marked named child after its parent’s rule, before a runtime sibling': style =>
    Div({
      ...style({ '& > :first-child': { color: 'rgb(200, 0, 0)' } }),
      children: [
        Div({ key: 's', ...style({ padding: 2 }, { carrier: true }), children: 'marked' }),
        Div({ key: 'r', ...style(RUNTIME, { runtime: true }), children: 'runtime' }),
      ],
    }),
  // With nothing after it, a named node's run went in with the rule before it.
  'a named node last, after a sibling’s rule': style =>
    Div({
      children: [Span('a', { key: 'a', ...style({ order: 1 }) }), Span('b', { key: 'b', ...style({ '& + *': { color: 'rgb(0, 0, 200)' } }) })],
    }),
  'a named node between parents, each with a rule': style =>
    Div({
      children: [
        Div({ key: 'p', ...style({ '& > :last-child': { color: 'rgb(0, 160, 0)' } }), children: [Span('x', { key: 'x', ...style({ margin: 1 }) })] }),
        Div({ key: 'q', ...style({ '& ~ *': { fontStyle: 'italic' } }), children: 'q' }),
        Span('tail', { key: 't', ...style({ order: 3 }) }),
      ],
    }),
  'named nodes in a row, the first a parent’s first child': style =>
    Div({
      ...style({ '& > :nth-child(2)': { color: 'rgb(0, 160, 0)' } }),
      children: [1, 2, 3].map(n => Span(String(n), { key: `n${n}`, ...style({ order: n }) })),
    }),
}

/** The server HTML of `tree`, under a cache that writes styles in place (Emotion's own, or one given) or one that collects them. */
function serverHtml(tree: (style: Style) => NodeInstance, style: Style, cache: 'none' | 'given' | 'collecting'): string {
  __resetStaticCss()
  const page = createElement(function Page() {
    return tree(style).render() as ReactElement
  })
  if (cache === 'none') return renderToString(page)
  const given = createCache({ key: 'css' })
  if (cache === 'collecting') given.compat = true
  return renderToString(createElement(CacheProvider, { value: given }, page))
}

describe.each([
  ['with no cache provider', 'none'],
  ['under a cache that writes styles in place', 'given'],
  ['under a cache that collects them', 'collecting'],
] as const)('%s', (_, cache) => {
  it.each(Object.entries(CASES))('%s: every <style> where its runtime twin writes it', (__, tree) => {
    const expected = serverHtml(tree, runtimeStyle, cache)
    if (cache !== 'collecting') expect(expected).toContain('<style')
    const compiled = serverHtml(tree, compiledStyle, cache)
    expect(compiled.replaceAll(` ${IN_PLACE_STYLE_ATTRIBUTE}=""`, '')).toBe(expected)
    // Every MeoNode-written style says it was written in place; a collecting cache writes none.
    const styles = compiled.match(/<style [^>]*>/g) ?? []
    const marked = styles.filter(tag => tag.includes(`${IN_PLACE_STYLE_ATTRIBUTE}=""`))
    if (cache === 'collecting') expect(styles).toEqual([])
    else expect(marked.length).toBeGreaterThan(0)
  })
})
