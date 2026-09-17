// @vitest-environment jsdom
//
// A caller that was never typechecked.
//
// `tokens`, `modes` and `defaultMode` are required props, so TypeScript catches
// a missing one — for a caller TypeScript sees. A sandbox, a JavaScript
// consumer, a CDN-cached bundle and a stale copy of a sample are all callers it
// does not, and for them the first symptom was
// `Cannot read properties of undefined (reading 'includes')` thrown from a
// minified helper inside React's commit phase.
//
// Worse, it only fired for some readers: adoption reads storage and the
// attribute, and with neither present the expression short-circuited before it
// touched `modes`. A first-time visitor was fine; anyone who had ever chosen a
// theme got a dead page. So the case that matters is a missing prop *together
// with* a stored preference, which is the combination nothing covered.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createNode, ThemeProvider, useTheme } from '@src/main.js'
import { refreshDevMode } from '@src/constant/common.const.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TOKENS = { colors: { primary: 'var(--brand-primary)' } }
const root = () => document.documentElement

const Child = createNode(function Child() {
  useTheme()
  return null
})

/**
 * React logs the error it rethrows; the assertion is on the throw itself.
 *
 * Mounted through `createRoot` rather than testing-library's `render`, because
 * a render that throws leaves that library's shared container half-built and its
 * automatic cleanup then fails for a reason unrelated to the case under test —
 * which is how every case in this file, including the valid one, reported the
 * same `NotFoundError` regardless of what it was asserting.
 */
function renderQuietly(build: () => unknown) {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    act(() => {
      root.render(build() as never)
    })
  } finally {
    error.mockRestore()
    container.remove()
  }
}

beforeEach(() => {
  const map = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    clear: () => map.clear(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  root().removeAttribute('data-theme')
  root().removeAttribute('data-theme-preference')
  document.querySelectorAll('style[data-meonode-theme-vars]').forEach(node => node.remove())
})

describe('a required prop that is missing', () => {
  it('names `modes` rather than dying inside a layout effect, even with a stored preference', () => {
    localStorage.setItem('theme', 'dark')
    expect(() => renderQuietly(() => ThemeProvider({ tokens: TOKENS, defaultMode: 'light', children: Child({}) } as never).render())).toThrow(
      /ThemeProvider: `modes` is missing/,
    )
  })

  it('names `modes` for a first-time reader too, who used to get no error at all', () => {
    // Nothing stored and no attribute: the old expression short-circuited before
    // it touched `modes`, so this caller was told nothing and rendered wrongly.
    expect(() => renderQuietly(() => ThemeProvider({ tokens: TOKENS, defaultMode: 'light', children: Child({}) } as never).render())).toThrow(
      /ThemeProvider: `modes` is missing/,
    )
  })

  it('names `defaultMode`', () => {
    expect(() => renderQuietly(() => ThemeProvider({ tokens: TOKENS, modes: ['light', 'dark'], children: Child({}) } as never).render())).toThrow(
      /ThemeProvider: `defaultMode` is missing/,
    )
  })

  it('names `tokens`', () => {
    expect(() => renderQuietly(() => ThemeProvider({ modes: ['light', 'dark'], defaultMode: 'light', children: Child({}) } as never).render())).toThrow(
      /ThemeProvider: `tokens` is missing/,
    )
  })

  it('says so when `defaultMode` is not one of the declared modes', () => {
    // The same class as a missing prop: it type-checks only for a caller who is
    // typechecked, and the reader sees a `[data-theme]` no selector matches.
    expect(() =>
      renderQuietly(() => ThemeProvider({ tokens: TOKENS, modes: ['light', 'dark'], defaultMode: 'sepia', children: Child({}) } as never).render()),
    ).toThrow(/ThemeProvider: `defaultMode`/)
  })

  it('says so when `modes` is empty', () => {
    expect(() => renderQuietly(() => ThemeProvider({ tokens: TOKENS, modes: [], defaultMode: 'light', children: Child({}) } as never).render())).toThrow(
      /ThemeProvider: `modes`/,
    )
  })

  it.each([
    ['tokens', { modes: ['light', 'dark'], defaultMode: 'light' }, /ThemeProvider: `tokens` is missing/],
    ['defaultMode', { tokens: TOKENS, modes: ['light', 'dark'] }, /ThemeProvider: `defaultMode` is missing/],
  ])('still throws in a production build when `%s` is missing', (_name, props, message) => {
    // One case per required prop, not one for the set. Gating any single check
    // on diagnostics leaves the others passing, so a suite that covers `modes`
    // alone reports green while `tokens` and `defaultMode` have gone quiet in
    // exactly the build where they matter.
    const env = process.env as Record<string, string | undefined>
    const previous = env.NODE_ENV
    env.NODE_ENV = 'production'
    refreshDevMode()
    try {
      localStorage.setItem('theme', 'dark')
      expect(() => renderQuietly(() => ThemeProvider({ ...props, children: Child({}) } as never).render())).toThrow(message)
    } finally {
      env.NODE_ENV = previous
      refreshDevMode()
    }
  })

  it('still throws in a production build, because the caller it protects was never typechecked', () => {
    // The whole point of not gating this on diagnostics. A sandbox or a stale
    // CDN copy runs a production bundle, and that is precisely the caller
    // TypeScript never saw — so a check that goes quiet there protects nobody.
    const env = process.env as Record<string, string | undefined>
    const previous = env.NODE_ENV
    env.NODE_ENV = 'production'
    refreshDevMode()
    try {
      localStorage.setItem('theme', 'dark')
      expect(() => renderQuietly(() => ThemeProvider({ tokens: TOKENS, defaultMode: 'light', children: Child({}) } as never).render())).toThrow(
        /ThemeProvider: `modes` is missing/,
      )
    } finally {
      env.NODE_ENV = previous
      refreshDevMode()
    }
  })

  it('leaves a correctly configured provider alone', () => {
    localStorage.setItem('theme', 'dark')
    expect(() =>
      renderQuietly(() => ThemeProvider({ tokens: TOKENS, modes: ['light', 'dark'], defaultMode: 'light', children: Child({}) } as never).render()),
    ).not.toThrow()
  })
})
