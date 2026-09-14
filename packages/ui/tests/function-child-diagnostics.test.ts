// @vitest-environment jsdom
//
// A function child that throws is the user's own code failing, and the only one
// of MeoNode's swallowed errors that is.
//
// `functionRenderer` catches, substitutes `null`, and carries on — so the
// element simply is not on the page, with nothing printed. Gated behind
// `setDebugMode`, that is undiscoverable: a blank space does not suggest a flag
// to turn on, and the reader has no reason to suspect the library caught
// anything.
//
// The criterion for which of MeoNode's swallowed errors get this treatment is
// whether the caller can act on it. The other three sites in `node.util.ts` are
// the library's own introspection hiccupping and recovering — the compiled-marker
// bucket contract, the `node.prototype.render` probe, the key-name derivation
// falling back — and all three are correct afterwards. This one leaves the
// caller's element missing.
//
// The function has to be an array member. `_processChildren` returns a bare
// function child untouched, so `children: fn` goes straight to React, which
// prints its own "Functions are not valid as a React child"; `functionRenderer`
// is only reached through `processRawNode`, which walks array members.
import { Div, setDebugMode } from '@src/main.js'
import { refreshDevMode } from '@src/constant/common.const.js'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

/** Every console channel, unfiltered — the message is ours, not React's. */
function consoleDuring(build: () => unknown): string[] {
  const seen: string[] = []
  const err = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' ')))
  const warn = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' ')))
  try {
    render(build() as never)
  } finally {
    err.mockRestore()
    warn.mockRestore()
  }
  return seen
}

const throwingChild = () => {
  throw new Error('boom from the caller')
}

/**
 * Swap NODE_ENV around a body. The value is captured once at module load, so
 *  it only takes effect after the captured value is re-read — in either direction.
 */
function inProductionBuild<T>(body: () => T): T {
  const env = process.env as Record<string, string | undefined>
  const previous = env.NODE_ENV
  env.NODE_ENV = 'production'
  refreshDevMode()
  try {
    return body()
  } finally {
    env.NODE_ENV = previous
    refreshDevMode()
  }
}

describe('a function child that throws', () => {
  it('is reported in a development build, where it would otherwise vanish silently', () => {
    const seen = consoleDuring(() => Div({ as: 'fc-a', children: [throwingChild] } as never).render())
    expect(seen.some(m => m.includes('function-as-a-child'))).toBe(true)
    expect(seen.some(m => m.includes('boom from the caller'))).toBe(true)
  })

  it('renders nothing for that child rather than taking the page down', () => {
    const view = render(Div({ as: 'fc-b', 'data-testid': 'host', children: [throwingChild] } as never).render() as never)
    expect(view.getByTestId('host').innerHTML).toBe('')
  })

  it('is silent in a production build', () => {
    const seen = inProductionBuild(() => consoleDuring(() => Div({ as: 'fc-c', children: [throwingChild] } as never).render()))
    expect(seen.some(m => m.includes('function-as-a-child'))).toBe(false)
  })

  it('is still reported in a production build when debug mode is on', () => {
    setDebugMode(true)
    try {
      const seen = inProductionBuild(() => consoleDuring(() => Div({ as: 'fc-d', children: [throwingChild] } as never).render()))
      expect(seen.some(m => m.includes('function-as-a-child'))).toBe(true)
    } finally {
      setDebugMode(false)
    }
  })
})
