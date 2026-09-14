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
import { refreshDevMode } from '@src/constant/common.const.js'
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
  // The whole point of the gate change: this has to reach someone who has hit
  // an unlocatable key warning and does not know the feature exists. That person
  // is running `next dev`, not `setDebugMode(true)`.
  it('names the call site in an ordinary development run, with no flag set', () => {
    const lines = meoLines(() => Div({ children: unkeyed(), [LIST]: 1, [LOC]: HERE } as never).render())
    expect(lines.some(m => m.includes(HERE))).toBe(true)
  })

  it('still names it when debug mode is on', () => {
    setDebugMode(true)
    const lines = meoLines(() => Div({ children: unkeyed(), [LIST]: 1, [LOC]: HERE } as never).render())
    expect(lines.some(m => m.includes(HERE))).toBe(true)
  })

  it('stays quiet when every row already carries a key', () => {
    const lines = meoLines(() => Div({ children: keyed(), [LIST]: 1, [LOC]: HERE } as never).render())
    expect(lines.some(m => m.includes(HERE))).toBe(false)
  })

  // `diagnosticsEnabled()` is on whenever NODE_ENV is not production, so an
  // unset `setDebugMode` no longer expresses "off" — under vitest it is on. A
  // production build is now the only thing that switches it off, and that is
  // what this asserts, so the silence is earned rather than free.
  it('stays quiet in a production build', () => {
    const env = process.env as Record<string, string | undefined>
    const previous = env.NODE_ENV
    env.NODE_ENV = 'production'
    // `NODE_ENV` is read once at module load rather than on every
    // `diagnosticsEnabled()` call — a per-call `getenv` costs ~112ns and runs at
    // every recursion level of every styled node. Changing the variable after
    // load therefore has no effect until the captured value is re-read, in
    // either direction.
    refreshDevMode()
    try {
      const lines = meoLines(() => Div({ children: unkeyed(), [LIST]: 1, [LOC]: HERE } as never).render())
      expect(lines.some(m => m.includes(HERE))).toBe(false)
    } finally {
      env.NODE_ENV = previous
      refreshDevMode()
    }
  })

  it('stays quiet when the plugin emitted no location', () => {
    const lines = meoLines(() => Div({ children: unkeyed(), [LIST]: 1 } as never).render())
    expect(lines.length).toBe(0)
  })

  // The case the line exists for. A marked list whose children reach a host
  // element through an unmarked node loses React's report entirely — the inner
  // node spreads them variadically, which is React's signal that a human wrote
  // them out. Our line is then the only signal there is, so it must still fire.
  it('still names the call site when React has been silenced by composition', () => {
    const Wrapper = ({ children }: { children?: unknown }) => Div({ children } as never).render()
    const lines = meoLines(() => createElement(Wrapper, { children: Div({ children: unkeyed(), [LIST]: 1, [LOC]: HERE } as never).render() }))
    expect(lines.some(m => m.includes(HERE))).toBe(true)
  })

  it('never lets the location reach the element', () => {
    const el = Div({ 'data-testid': 'host', children: unkeyed(), [LIST]: 1, [LOC]: HERE } as never).render() as {
      props: Record<string, unknown>
    }
    expect(Object.keys(el.props).filter(k => k.startsWith('__meo$'))).toEqual([])
  })
})
