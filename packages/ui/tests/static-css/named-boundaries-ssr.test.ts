// @vitest-environment node
//
// A named node beside a boundary the compiler does not see as a component, in a
// streamed server render: once every boundary has streamed, the page has the
// same elements and its rules come in the same order as uncompiled, and
// `.render()` returns the same structure.
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { createElement, type ReactElement } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { Writable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { __resetStaticCss } from '@src/util/static-css.util.js'
import { shapedAsync } from './_render-shapes.js'
import { CASES, compiledStyle, runtimeStyle, type Style } from './_boundaries.js'
import type { NodeInstance } from '@src/main.js'

const STYLE_ELEMENT = /<style data-emotion="([^"]*)"[^>]*>(.*?)<\/style>/g
/** The page's markup without its style elements or React's streaming scripts, and the rules in order. */
function read(html: string): { markup: string; rules: string[] } {
  const rules: string[] = []
  for (const [, , text] of html.matchAll(STYLE_ELEMENT)) for (const rule of text.split(/(?<=\})(?=[.@])/)) if (rule) rules.push(rule)
  return { markup: html.replace(STYLE_ELEMENT, '').replace(/<script>.*?<\/script>/g, ''), rules }
}

/** Streams the tree, resolving what its content waits for once the shell is out. */
const stream = shapedAsync(
  (tree: (style: Style, data: Promise<string>) => NodeInstance, style: Style, provider: boolean) =>
    new Promise<ReturnType<typeof read>>((done, fail) => {
      __resetStaticCss()
      let resolve!: (value: string) => void
      const data = new Promise<string>(r => (resolve = r))
      let html = ''
      const sink = new Writable({
        write(chunk, _, callback) {
          html += chunk
          callback()
        },
        final(callback) {
          done(read(html))
          callback()
        },
      })
      const page = createElement(function Page() {
        return tree(style, data).render() as ReactElement
      })
      const { pipe } = renderToPipeableStream(provider ? createElement(CacheProvider, { value: createCache({ key: 'css' }) }, page) : page, {
        onShellReady() {
          pipe(sink)
          setTimeout(() => resolve('in'), 10)
        },
        onShellError: fail,
      })
    }),
)

afterEach(() => __resetStaticCss())

describe.each([
  ['with no cache provider', false],
  ['under a cache provider', true],
])('a named node beside a boundary, streamed %s', (_, provider) => {
  it.each(CASES)('%s', async (__, tree) => {
    const expected = await stream(tree, runtimeStyle, provider)
    expect(expected.rules.length).toBeGreaterThan(0)
    expect(await stream(tree, compiledStyle, provider)).toEqual(expected)
  })
})
