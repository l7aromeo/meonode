// @vitest-environment jsdom
//
// The call-site location line.
//
// React's missing-key report says what is wrong. It cannot say where: `Div({...})`
// only builds a node, and `createElement` fires later inside `.render()`, so React
// attributes every element in the tree to that one call. The compiler is the only
// thing that still knows where a list was written, and `__meo$loc` carries it.
//
// We add a line; we do not replace React's. It is gated behind `setDebugMode` so a
// default development build stays quiet until asked, and the key is only emitted at
// all when the plugin is configured to.
import { Div, Span, setDebugMode } from '@src/main.js'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const LIST = '__meo$list'
const LOC = '__meo$loc'
const HERE = 'app/page.tsx:12:3'

afterEach(() => setDebugMode(false))

/** Everything MeoNode logged while rendering `build()`. */
function meoLines(build: () => unknown): string[] {
  const seen: string[] = []
  const spies = (['log', 'warn', 'error'] as const).map(level =>
    vi.spyOn(console, level).mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' '))),
  )
  try {
    renderToStaticMarkup(build() as never)
  } finally {
    spies.forEach(s => s.mockRestore())
  }
  return seen.filter(m => m.includes('[MeoNode]') || m.includes('MeoNode:'))
}

const unkeyed = () => ['a', 'b', 'c'].map(id => Span(id))
const keyed = () => ['a', 'b', 'c'].map(id => Span(id, { key: id }))

describe('the call-site location line', () => {
  it('names the call site when a generated list is missing keys', () => {
    setDebugMode(true)
    const lines = meoLines(() => Div({ children: unkeyed(), [LIST]: 1, [LOC]: HERE } as never).render())
    expect(lines.some(m => m.includes(HERE))).toBe(true)
  })

  it('stays quiet when every row already carries a key', () => {
    setDebugMode(true)
    const lines = meoLines(() => Div({ children: keyed(), [LIST]: 1, [LOC]: HERE } as never).render())
    expect(lines.some(m => m.includes(HERE))).toBe(false)
  })

  it('stays quiet unless debug mode is on', () => {
    const lines = meoLines(() => Div({ children: unkeyed(), [LIST]: 1, [LOC]: HERE } as never).render())
    expect(lines.some(m => m.includes(HERE))).toBe(false)
  })

  it('stays quiet when the plugin emitted no location', () => {
    setDebugMode(true)
    const lines = meoLines(() => Div({ children: unkeyed(), [LIST]: 1 } as never).render())
    expect(lines.length).toBe(0)
  })

  // The case the line exists for. A marked list whose children reach a host
  // element through an unmarked node loses React's report entirely — the inner
  // node spreads them variadically, which is React's signal that a human wrote
  // them out. Our line is then the only signal there is, so it must still fire.
  it('still names the call site when React has been silenced by composition', () => {
    setDebugMode(true)
    const Wrapper = ({ children }: { children?: unknown }) => Div({ children } as never).render()
    const lines = meoLines(() => createElement(Wrapper, { children: Div({ children: unkeyed(), [LIST]: 1, [LOC]: HERE } as never).render() }))
    expect(lines.some(m => m.includes(HERE))).toBe(true)
  })

  it('never lets the location reach the element', () => {
    setDebugMode(true)
    const el = Div({ 'data-testid': 'host', children: unkeyed(), [LIST]: 1, [LOC]: HERE } as never).render() as {
      props: Record<string, unknown>
    }
    expect(Object.keys(el.props).filter(k => k.startsWith('__meo$'))).toEqual([])
  })
})
