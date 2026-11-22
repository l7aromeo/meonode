// @vitest-environment node
//
// StyleRegistry's server flush must write rules in the order the cache
// inserted them, as Emotion's own server render does. Where two elements' rules
// tie on specificity, that order decides the winner; any other order (sorted by
// class name, say) settles the tie by the two hashes instead, so the first paint
// and the page after hydration could differ from a client navigation, where
// rules go in as they are inserted.
import type { EmotionCache } from '@emotion/cache'
import { __unsafe_useEmotionCache as useEmotionCache } from '@emotion/react'
import { insertStyles } from '@emotion/utils'
import { createRequire } from 'node:module'
import { ServerInsertedHTMLContext } from 'next/navigation.js'
import { createElement, Fragment, type ReactElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import StyleRegistry from '@src/components/style-registry.client.js'
import { Div, Node, Span } from '@src/main.js'

/** jsdom, which ships no types, as much of it as these tests use. */
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string) => { window: Window & typeof globalThis } }

/** The Emotion cache the calling component renders under; StyleRegistry always provides one. */
function cacheOf(): EmotionCache {
  const cache = useEmotionCache()
  if (!cache) throw new Error('rendered outside an Emotion cache')
  return cache
}

/** Server-renders `page` under StyleRegistry: the HTML its flush writes, and the body. */
function renderWithRegistry(page: () => ReactElement): { flushed: string; body: string } {
  const callbacks: (() => ReactNode)[] = []
  const body = renderToString(
    createElement(ServerInsertedHTMLContext.Provider, { value: callback => callbacks.push(callback) }, createElement(StyleRegistry, null, page())),
  )
  return { flushed: renderToString(createElement(Fragment, null, ...callbacks.map(callback => callback()))), body }
}

/** The ids of the flush's style element, in the order it lists them. */
const flushedIds = (flushed: string) => (flushed.match(/data-emotion="meonode-css ([^"]*)"/)?.[1] ?? '').split(' ').filter(Boolean)

/** A component that inserts styles named `names`, in that order, into the cache it renders under. */
function InsertNamed({ names }: { names: string[] }): ReactElement {
  const cache = cacheOf()
  for (const name of names) insertStyles(cache, { name, styles: `--order-${name}:1;`, next: undefined }, false)
  return createElement('span')
}

describe('the StyleRegistry server flush', () => {
  it('writes styles in the order the cache inserted them, not sorted', () => {
    // Inserted in reverse alphabetical order, so a sort would reverse them.
    const names = ['zeta', 'mid', 'alpha']
    const { flushed } = renderWithRegistry(() => Node(InsertNamed, { names }).render() as ReactElement)

    expect(flushedIds(flushed)).toEqual(names)
    expect(flushed.indexOf('--order-zeta')).toBeLessThan(flushed.indexOf('--order-mid'))
    expect(flushed.indexOf('--order-mid')).toBeLessThan(flushed.indexOf('--order-alpha'))
  })

  it('keeps the inserted order for a name made only of digits', () => {
    // An object lists an integer-like key before the others whatever the insertion order, so reading the order back
    // from the cache's `inserted` map would move it first.
    const names = ['second-first', '42', 'third']
    const { flushed } = renderWithRegistry(() => Node(InsertNamed, { names }).render() as ReactElement)

    expect(flushedIds(flushed)).toEqual(names)
  })

  it('writes keyframes two styles share once, where the first inserted them', () => {
    // Emotion inserts a style, then its chained keyframes, each time the style is new, the keyframes already inserted or not.
    const spin = { name: 'spin', styles: '@keyframes spin{to{opacity:1;}}', next: undefined }
    function SharedKeyframes(): ReactElement {
      const cache = cacheOf()
      insertStyles(cache, { name: 'first', styles: 'animation:spin 1s;', next: spin }, false)
      insertStyles(cache, { name: 'second', styles: 'animation:spin 2s;', next: spin }, false)
      return createElement('span')
    }
    const { flushed } = renderWithRegistry(() => Node(SharedKeyframes).render() as ReactElement)

    expect(flushedIds(flushed)).toEqual(['first', 'spin', 'second'])
    expect(flushed.split('@keyframes spin').length - 1).toBe(1)
  })

  it('places a style where the cache first kept it, not where it was first inserted uncached', () => {
    // An insert that does not cache (Emotion's Global inserts this way) leaves nothing to flush, so it sets no place.
    function UncachedFirst(): ReactElement {
      const cache = cacheOf()
      const late = { name: 'late', styles: '--order-late:1;', next: undefined }
      cache.insert('.late', late, cache.sheet, false)
      insertStyles(cache, { name: 'early', styles: '--order-early:1;', next: undefined }, false)
      insertStyles(cache, late, false)
      return createElement('span')
    }
    const { flushed } = renderWithRegistry(() => Node(UncachedFirst).render() as ReactElement)

    expect(flushedIds(flushed)).toEqual(['early', 'late'])
  })

  it('writes a style two nodes share once, where the first inserted it', () => {
    const { flushed } = renderWithRegistry(() => Node(InsertNamed, { names: ['shared', 'other', 'shared'] }).render() as ReactElement)

    expect(flushedIds(flushed)).toEqual(['shared', 'other'])
    expect(flushed.split('--order-shared').length - 1).toBe(1)
  })
})

/** A parent whose rule reaches its child, tied on specificity with the child's own colour. */
const tie = () =>
  Div({
    css: { '& > *': { color: 'rgb(0, 160, 0)' } },
    children: Span('child', { 'data-testid': 'child', css: { color: 'rgb(0, 0, 200)' } }),
  }).render() as ReactElement

/** The child's computed colour in a document holding `head` and `body`. */
function childColour(head: string, body: string): string {
  const { window } = new JSDOM(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`)
  return window.getComputedStyle(window.document.querySelector('[data-testid="child"]')!).color
}

describe('a tie between two elements under StyleRegistry', () => {
  it('resolves at first paint as Emotion orders its own server styles', () => {
    // Emotion's server render with no registry writes each style inline where it is inserted, in render order:
    // the order a client navigation inserts the same rules in.
    const inline = renderToString(tie())
    const expected = childColour('', inline)
    const { flushed, body } = renderWithRegistry(tie)

    expect(childColour(flushed, body)).toBe(expected)
  })

  it('has class names whose sorted order differs from their inserted order, so the tie can show a sort', () => {
    // The inserted order, read from Emotion's own inline styles, which are written as each is inserted.
    const inserted = [...renderToString(tie()).matchAll(/data-emotion="css ([^"]*)"/g)].map(match => match[1])

    expect(inserted.length).toBe(2)
    expect([...inserted].sort()).not.toEqual(inserted)
  })
})

/** Server-renders one StyleRegistry per page in `passes` under one inserted-HTML list, as Next's two prerender passes do. */
function streamWithRegistry(...passes: string[][]) {
  const callbacks: (() => ReactNode)[] = []
  const caches: EmotionCache[] = []
  const provide = (callback: () => ReactNode) => callbacks.push(callback)
  for (const names of passes) {
    function Capture(): ReactElement {
      caches.push(cacheOf())
      return createElement(InsertNamed, { names })
    }
    renderToString(
      createElement(ServerInsertedHTMLContext.Provider, { value: provide }, createElement(StyleRegistry, null, Node(Capture).render() as ReactElement)),
    )
  }
  return {
    /** Inserts styles into the first pass's cache, as a later streamed boundary would. */
    insert: (more: string[]) => more.forEach(name => insertStyles(caches[0], { name, styles: `--order-${name}:1;`, next: undefined }, false)),
    /** The ids each pass's flush writes, called in pass order. */
    flush: () => callbacks.map(callback => flushedIds(renderToString(createElement(Fragment, null, callback())))),
  }
}

describe('a streamed StyleRegistry flush', () => {
  it('writes only what was inserted since the last flush, in order', () => {
    const page = streamWithRegistry(['a', 'b'])
    expect(page.flush()).toEqual([['a', 'b']])
    page.insert(['c', 'a', 'd'])
    expect(page.flush()).toEqual([['c', 'd']])
    expect(page.flush()).toEqual([[]])
  })

  it('looks only at styles inserted since the last flush', () => {
    // Reading every earlier id again on each flush makes a page with k flushes cost O(n·k).
    const earlier = Array.from({ length: 50 }, (_, index) => `earlier-${index}`)
    const page = streamWithRegistry(earlier)
    expect(page.flush()).toEqual([earlier])
    page.insert(['late'])
    const looked: unknown[] = []
    const has = Set.prototype.has
    const spy = vi.spyOn(Set.prototype, 'has').mockImplementation(function (this: Set<unknown>, value: unknown) {
      looked.push(value)
      return has.call(this, value)
    })
    let flushed: string[][]
    try {
      flushed = page.flush()
    } finally {
      spy.mockRestore()
    }
    expect(flushed).toEqual([['late']])
    expect(earlier.filter(id => looked.includes(id))).toEqual([])
  })

  it('writes a rule only the second prerender pass inserted, wherever it sits in that pass', () => {
    // Both passes share what was flushed; each reads its own cache from its own start.
    const page = streamWithRegistry(['a', 'b', 'c'], ['x', 'a', 'b'])
    expect(page.flush()).toEqual([['a', 'b', 'c'], ['x']])
  })
})
