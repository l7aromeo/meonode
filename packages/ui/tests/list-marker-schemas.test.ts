// @vitest-environment jsdom
//
// The list marker as it actually arrives from the compiler: beside a schema
// field, on a call site whose props were partitioned into `c`/`d` buckets.
// `tests/list-detection.test.ts` pins down what the runtime does with the
// answer; these cases pin down which schemas it is willing to read it from.
//
// Worth its own file because the two branches of `processProps` are separate
// code — a call site carrying a schema takes the compiled fast path and never
// reaches the legacy destructure — so a marker honoured on one says nothing
// about the other.
import { Div } from '@src/main.js'
import { COMPILED_MARKER, LIST_MARKER } from '@src/constant/common.const.js'
import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

let uid = 0

/**
 * React reports a missing key from the reconciler, and deduplicates it by the
 * name of the *parent* the list was reconciled under — not by the row type, and
 * not by the owner. Two cases that both render their rows into a `<div>` are one
 * `div` to that cache, so the second is silently dropped however fresh its rows
 * are. Each case below therefore renders under a tag of its own, and this helper
 * hands out both the tag and a matching row type.
 */
function reportsMissingKey(build: (ctx: { tag: string; rows: () => unknown[] }) => unknown): boolean {
  const n = ++uid
  const Row = () => createElement('i', null, 'x')
  Object.defineProperty(Row, 'name', { value: 'SchemaRow' + n })
  // Three tags that are ordinary block containers, so nothing about the element
  // itself changes between cases — only the name React dedupes on.
  const tag = ['section', 'article', 'aside', 'main', 'nav', 'header'][n % 6]

  const seen: string[] = []
  const err = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' ')))
  const warn = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' ')))
  try {
    render(build({ tag, rows: () => [0, 1, 2].map(() => createElement(Row)) }) as never)
  } finally {
    err.mockRestore()
    warn.mockRestore()
  }
  return seen.some(m => /\bkey\b/i.test(m))
}

describe('the list marker beside a compiled schema', () => {
  it('is read on schema 2, alongside the c/d buckets', () => {
    const reported = reportsMissingKey(({ tag, rows }) =>
      Div({ as: tag, [COMPILED_MARKER]: 2, __meo$c: { padding: '4px' }, __meo$d: { id: 'list' }, children: rows(), [LIST_MARKER]: 1 } as never).render(),
    )
    expect(reported).toBe(true)
  })

  it('is read on schema 3, which carries no buckets at all', () => {
    const reported = reportsMissingKey(({ tag, rows }) =>
      Div({ as: tag, [COMPILED_MARKER]: 3, __meo$k: 'abc123', children: rows(), [LIST_MARKER]: 1 } as never).render(),
    )
    expect(reported).toBe(true)
  })

  // Schema 1's bucket names are unprefixed, which is why it was superseded: a
  // spread can carry a real prop of the same name. It is frozen legacy output
  // and deliberately gains nothing new, so a marker-shaped key on it is just a
  // prop, and one the runtime has no reason to trust.
  it('is ignored on schema 1, which the contract never extended', () => {
    const reported = reportsMissingKey(({ tag, rows }) =>
      Div({ as: tag, [COMPILED_MARKER]: 1, c: { padding: '4px' }, children: rows(), [LIST_MARKER]: 1 } as never).render(),
    )
    expect(reported).toBe(false)
  })

  // Schema 1 does not *read* the marker, but it must still not forward it: the
  // `__meo$` prefix is the compiler's, so no schema has a reason to let a key
  // wearing it reach the element.
  it('never reaches the DOM, on any schema that carries it', () => {
    for (const schema of [1, 2, 3]) {
      const view = render(Div({ [COMPILED_MARKER]: schema, children: [Div({ children: 'a' })], [LIST_MARKER]: 1 } as never).render() as never)
      expect(view.container.innerHTML).not.toContain('__meo$')
      cleanup()
    }
  })
})
