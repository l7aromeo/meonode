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
import { Div, H1 } from '@src/main.js'
import { COMPILED_MARKER, LIST_MARKER } from '@src/constant/common.const.js'
import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

// A note both halves of this contract are tested against, learned twice in one
// day: an assertion about a React *development warning* is only meaningful in
// the first case that triggers it. React deduplicates each of these, and by
// different keys — the missing-key report by the name of the parent the list
// reconciled under, the invalid-attribute-name message by the attribute name,
// each once per process. A later case asserting a warning appears sees nothing;
// worse, a later case asserting one does NOT appear passes without proving it.
// So a new case here has to be read against everything that ran before it, and
// anything that can be asserted on a value instead of on a warning should be.

let uid = 0

/**
 * React reports a missing key from the reconciler, and deduplicates it by the
 * name of the *parent* the list was reconciled under — not by the row type, and
 * not by the owner. Two cases that both render their rows into a `<div>` are one
 * `div` to that cache, so the second is silently dropped however fresh its rows
 * are, and a case asserting that nothing is reported passes without proving it.
 * Each case below therefore renders under a tag of its own.
 *
 * A hyphenated name is a custom element to React, which reconciles and reports
 * exactly as a built-in does, and unlike a fixed list of real tags it cannot run
 * out as this file grows.
 */
function reportsMissingKey(build: (ctx: { tag: string; rows: (count?: number) => unknown[] }) => unknown): boolean {
  const n = ++uid
  const Row = () => createElement('i', null, 'x')
  const tag = `meo-schema-${n}`

  const seen: string[] = []
  const err = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' ')))
  const warn = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' ')))
  try {
    render(build({ tag, rows: (count = 3) => Array.from({ length: count }, () => createElement(Row)) }) as never)
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
  //
  // This case is also the only thing standing under the compiled path's strip of
  // `__meo$list`, and not for the reason that strip looks like it exists for.
  // Leaving the key in place does not leak it to the DOM — `BaseNode.render`
  // destructures the marker off before `otherProps` is built, so nothing reaches
  // an element either way. What happens instead is that the key survives into
  // `passthrough`, is classified by `getDOMProps` onto `FinalNodeProps`, and is
  // then read back as the carrier — so a SCHEMA 1 call site starts taking the
  // list form and reporting, on a schema the contract was never extended to.
  //
  // Established by mutation, after an earlier reading of mine had the strips
  // down as interchangeable belt-and-braces. Removing this one fails exactly
  // this case and nothing else.
  it('is ignored on schema 1, which the contract never extended', () => {
    const reported = reportsMissingKey(({ tag, rows }) =>
      Div({ as: tag, [COMPILED_MARKER]: 1, c: { padding: '4px' }, children: rows(), [LIST_MARKER]: 1 } as never).render(),
    )
    expect(reported).toBe(false)
  })

  // Schema 1 does not *read* the marker, but it must still not forward it: the
  // `__meo$` prefix is the compiler's, so no schema has a reason to let a key
  // wearing it reach the element.
  //
  // Asserted on the element rather than on the markup. The `$` makes the name an
  // invalid attribute, so React drops it and the DOM comes out clean whether or
  // not anything stripped it — a markup assertion here passes with no stripping
  // at all and proves only that React validates attribute names.
  it('never reaches the element, on any schema that carries it', () => {
    for (const schema of [1, 2, 3]) {
      const element = Div({ [COMPILED_MARKER]: schema, children: [Div({ children: 'a' })], [LIST_MARKER]: 1 } as never).render() as {
        props: Record<string, unknown>
      }
      expect(Object.keys(element.props).filter(k => k.startsWith('__meo$'))).toEqual([])
    }
  })

  // A one-row generated list, on the path real compiler output actually takes.
  //
  // Keeping a marked call site's one-element array is decided in three separate
  // places — `_processChildren` is called once from the compiled branch of
  // `processProps` and twice from the legacy one — so covering it on one branch
  // says nothing about the others. Every case in `list-detection.test.ts` sets
  // the marker without a schema field and therefore exercises only the legacy
  // branch, while every case in this file used three rows. That left the
  // compiled branch's `keepArray` argument untested, and it is the branch every
  // real compiled call site goes through, since real output always carries
  // `__meo$`. Removing that argument kept all 306 tests green while reopening
  // the one-row hole for every compiled build.
  it('is read on schema 2 when the generated list holds a single row', () => {
    const reported = reportsMissingKey(({ tag, rows }) =>
      Div({ as: tag, [COMPILED_MARKER]: 2, __meo$c: { padding: '4px' }, children: rows(1), [LIST_MARKER]: 1 } as never).render(),
    )
    expect(reported).toBe(true)
  })

  // The same, on the shape the compiler synthesizes for `Span(items.map(fn))`,
  // where a `.map()` over one row is as ordinary as it gets.
  it('is read on a synthesized schema 3 object holding a single row', () => {
    const reported = reportsMissingKey(({ tag, rows }) => Div({ as: tag, [COMPILED_MARKER]: 3, [LIST_MARKER]: 1, children: rows(1) } as never).render())
    expect(reported).toBe(true)
  })

  // The object the compiler synthesizes for a children-first call with no props
  // of its own — `Span(items.map(fn))` — is this and nothing else: schema 3 with
  // no `__meo$k` and no buckets. It omits the key deliberately, since nothing in
  // this runtime reads one. Correct today by construction, but the literal is
  // pinned here so a future change that started reading `k` on schema 3 fails
  // against the shape that has none rather than silently skipping it.
  it('is read on a synthesized schema 3 object that carries nothing else', () => {
    const reported = reportsMissingKey(({ tag, rows }) => Div({ as: tag, [COMPILED_MARKER]: 3, [LIST_MARKER]: 1, children: rows() } as never).render())
    expect(reported).toBe(true)
  })
})

// The children-first factories take their children at argument 0 and their props
// at argument 1, so the marker describing a list arrives *beside* the list rather
// than alongside it in one object — and for a call with no props of its own, in
// an argument the author never wrote, synthesized by the compiler. Worth its own
// cases because `createChildrenFirstNode` merges as `{ ...initialProps, ...props,
// children }`: the marker comes in through the spread and the children are
// appended last, so the two reach `processProps` by different routes.
describe('the list marker on a children-first call', () => {
  it('is read when the props argument was written by the author', () => {
    const reported = reportsMissingKey(({ tag, rows }) =>
      H1(rows() as never, { as: tag, [COMPILED_MARKER]: 3, [LIST_MARKER]: 1, padding: 8 } as never).render(),
    )
    expect(reported).toBe(true)
  })

  // `Span(items.map(fn))` — the compiler appends an argument that did not exist,
  // holding the marker and nothing else.
  it('is read when the props argument was synthesized for it', () => {
    const reported = reportsMissingKey(({ tag, rows }) => H1(rows() as never, { as: tag, [COMPILED_MARKER]: 3, [LIST_MARKER]: 1 } as never).render())
    expect(reported).toBe(true)
  })

  it('stays silent on an unmarked children-first call', () => {
    const reported = reportsMissingKey(({ tag, rows }) => H1(rows() as never, { as: tag } as never).render())
    expect(reported).toBe(false)
  })

  it('never reaches the element from the props argument', () => {
    const element = H1(['a'] as never, { [COMPILED_MARKER]: 3, [LIST_MARKER]: 1 } as never).render() as { props: Record<string, unknown> }
    expect(Object.keys(element.props).filter(k => k.startsWith('__meo$'))).toEqual([])
  })
})
