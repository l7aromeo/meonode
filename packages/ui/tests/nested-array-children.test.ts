// @vitest-environment jsdom
//
// SPEC — a `children` array may contain arrays.
//
// React flattens nested children arbitrarily, and the shape matters beyond
// convenience: React exempts siblings written out beside a NESTED array from its
// missing-key check, and does not exempt them beside a flat spread. Without
// nested support the only way to combine authored siblings with a list is the
// spread, which forfeits that exemption — so the missing feature is what produces
// the reported-on shape.
//
// Every count of a React development warning here is the CLIENT reconciler's,
// under jsdom. The server renderer keeps its own budgets and its own answers; see
// the note in `list-detection.test.ts`.
import { Div, Span, Component } from '@src/main.js'
import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const LIST_MARKER = '__meo$list'

let uid = 0
/** A parent tag no other case uses — React dedupes its missing-key report per parent. */
const freshParent = () => `meo-nest-${++uid}`

function capture(build: (parentTag: string) => unknown) {
  const seen: string[] = []
  const err = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' ')))
  const warn = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' ')))
  let html: string
  try {
    html = render(build(freshParent()) as never).container.innerHTML
  } finally {
    err.mockRestore()
    warn.mockRestore()
  }
  return { html, keyReports: seen.filter(m => /unique "key"/i.test(m)).length, messages: seen }
}

describe('nested arrays in children', () => {
  it('render at one level', () => {
    const { html } = capture(as => Div({ as, children: [Span('a'), [Span('b'), Span('c')]] } as never).render())
    expect(html).toBe('<meo-nest-1><span>a</span><span>b</span><span>c</span></meo-nest-1>')
  })

  it('render at two levels, because React flattens arbitrarily', () => {
    const { html } = capture(as => Div({ as, children: [Span('a'), [[Span('deep')]]] } as never).render())
    expect(html).toContain('<span>a</span><span>deep</span>')
  })

  it('normalize what they contain — a function child inside one still runs', () => {
    const { html } = capture(as => Div({ as, children: [Span('h'), [() => Span('fn')]] } as never).render())
    expect(html).toContain('<span>fn</span>')
  })

  it('normalize a Component node inside one', () => {
    const Hooky = Component<{ id: string }>(function Hooky({ id }) {
      return Span(id)
    })
    const { html } = capture(as => Div({ as, children: [Span('h'), [Hooky({ id: 'q' })]] } as never).render())
    expect(html).toContain('<span>q</span>')
  })

  it('carry keys on the rows they hold', () => {
    const { html, keyReports } = capture(as => Div({ as, children: [Span('h'), [Span('a', { key: 'a' }), Span('b', { key: 'b' })]] } as never).render())
    expect(keyReports).toBe(0)
    expect(html).toContain('<span>a</span><span>b</span>')
  })

  it('tolerate an empty nested array', () => {
    const { html } = capture(as => Div({ as, children: [Span('h'), []] } as never).render())
    expect(html).toBe('<meo-nest-6><span>h</span></meo-nest-6>')
  })

  it('tolerate a marked call site whose only child is an empty nested array', () => {
    const { html, keyReports } = capture(as => Div({ as, [LIST_MARKER]: 1, children: [[]] } as never).render())
    expect(keyReports).toBe(0)
    expect(html).toBe('<meo-nest-7></meo-nest-7>')
  })

  it('do not hang on a children array that contains itself', () => {
    const cyclic: unknown[] = [Span('a')]
    cyclic.push(cyclic)
    expect(() => capture(as => Div({ as, children: cyclic } as never).render())).not.toThrow(/Maximum call stack/)
  })
})

// The point of the exercise. React exempts an authored sibling standing beside a
// NESTED array; it does not exempt one standing beside a flat spread. Until
// nested arrays were supported, the spread was the only way to write this, so
// the library forced the reported-on shape on anyone combining the two.
describe('an authored sibling beside a generated list', () => {
  // Written the way the compiler classifies each shape, which is what decides
  // whether the marker is there at all: any spread in a children array makes the
  // whole array generated, and a bare identifier does not — so `[h, rows]` is
  // authored and `[h, ...rows]` is generated.
  it('is exempt when the list stays nested, and is not when it is spread flat', () => {
    const keyedRows = () => [0, 1, 2].map(i => createElement('i', { key: `r${i}` }))

    // `[h, rows]` — no spread, so unmarked. This is the shape the feature adds.
    const nested = capture(as => Div({ as, children: [createElement('i', null, 'h'), keyedRows()] } as never).render())
    // `[h, ...rows]` — a spread, so marked, and flattened into one argument.
    const flat = capture(as => Div({ as, [LIST_MARKER]: 1, children: [createElement('i', null, 'h'), ...keyedRows()] } as never).render())

    expect(nested.keyReports).toBe(0)
    expect(flat.keyReports).toBe(1)
  })

  // The third corner, pinned because it is the one that looks like a bug and is
  // not. Marking a nested shape hands the whole array to React as one argument,
  // so the authored sibling is checked after all — the exemption belongs to the
  // argument position, not to the nesting. The compiler does not emit this
  // combination for `[h, rows]`; a hand-written marker is the only way to reach
  // it, and if that ever changes this case is where it will show.
  it('loses the exemption if a nested shape is marked anyway', () => {
    const keyedRows = () => [0, 1, 2].map(i => createElement('i', { key: `r${i}` }))
    const marked = capture(as => Div({ as, [LIST_MARKER]: 1, children: [createElement('i', null, 'h'), keyedRows()] } as never).render())
    expect(marked.keyReports).toBe(1)
  })
})
