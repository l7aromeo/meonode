// @vitest-environment jsdom
//
// SPEC — what the runtime does with the compiler's list marker.
//
// An unkeyed list reconciles by position, so a delete or a reorder gives each
// surviving row the previous row's state. React reports that; MeoNode cannot,
// because `render()` spreads children variadically into `createElement`, which
// tells React "a human wrote these out" for every list alike.
//
// Whether children were authored or generated is decidable only from the
// source — arguments are evaluated before the callee runs, so `items.map(fn)`
// has already collapsed into an ordinary array by the time `Div({ children })`
// is entered. The compiler answers that question and records it in the marker;
// these cases pin down what the runtime must do with the answer, and so are
// written with the marker set by hand.
//
// Set by hand *without* a schema field, which is a shape the compiler never
// emits — every object it produces carries `__meo$` too. That makes this file a
// test of the legacy branch of `processProps` only; the compiled branch is
// separate code and is covered in `list-marker-schemas.test.ts`, including the
// bare `{ __meo$: 3, __meo$list: 1 }` object the compiler synthesizes for a
// children-first call.
import { Div } from '@src/main.js'
import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The key the compiler sets on a call site whose `children` expression was
// generated rather than written out. Local to the spec on purpose: when the
// runtime exports it, this constant is replaced by that import and the spec
// starts asserting against the real contract.
const LIST_MARKER = '__meo$list'

afterEach(cleanup)

const Row = () => createElement('i', null, 'x')

let uid = 0

/**
 * A parent tag no other case uses.
 *
 * React reports a missing key from the reconciler, and remembers that it has
 * reported one for a given PARENT — `getComponentNameFromFiber(returnFiber)` —
 * never reporting for that parent again in the process. Not per row type: a
 * fresh row type per case buys nothing, and an earlier case that rendered into
 * a `<div>` silences every later `<div>` in the file, including the ones
 * asserting that nothing is reported. Those read as passing while proving
 * nothing at all.
 *
 * So each case gets a parent of its own, and `keyReports` hands it out rather
 * than trusting the case to remember. A hyphenated name is a custom element to
 * React, which reconciles and reports exactly as a built-in does, and unlike a
 * list of real tags it cannot run out as this file grows.
 */
const freshParent = () => `meo-list-${++uid}`

/**
 * Renders what `build` returns under a parent no other case has used, and counts
 * the missing-key reports it produced. `build` must put the tag it is given on
 * the element holding the list, or the count is meaningless.
 */
function keyReports(build: (parentTag: string) => unknown): number {
  const seen: string[] = []
  const err = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' ')))
  const warn = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' ')))
  try {
    render(build(freshParent()) as never)
  } finally {
    err.mockRestore()
    warn.mockRestore()
  }
  return seen.filter(m => /\bkey\b/i.test(m)).length
}

describe('generated children, as marked by the compiler', () => {
  it('are reported when they carry no key', () => {
    const children = ['a', 'b', 'c'].map(() => createElement(Row))
    expect(keyReports(as => Div({ as, children, [LIST_MARKER]: 1 } as never).render())).toBeGreaterThan(0)
  })

  // A generated list of one still reconciles by position, and still hands its
  // state to whatever takes that position next — it simply has no neighbour to
  // trade with *yet*, and has three rows next week. React draws the line in the
  // same place: an unkeyed one-element array is reported.
  it('are reported when a generated list holds a single row', () => {
    const children = ['only'].map(() => createElement(Row))
    expect(keyReports(as => Div({ as, children, [LIST_MARKER]: 1 } as never).render())).toBeGreaterThan(0)
  })

  // The other side of that line, and the reason the array is kept rather than
  // the marker being trusted on its own. `children: row` — a variable holding a
  // single node — is generated as far as the compiler can tell, because it
  // cannot see inside an identifier. React says nothing for a bare child, so
  // neither do we: the marker says the expression was generated, and the value
  // says what it generated.
  it('are not reported when the generated expression yielded a single node', () => {
    const row = createElement(Row)
    expect(keyReports(as => Div({ as, children: row, [LIST_MARKER]: 1 } as never).render())).toBe(0)
  })

  // Same line, for a generated value that has no key concept at all.
  it('are not reported for generated text', () => {
    expect(keyReports(as => Div({ as, children: 'generated text', [LIST_MARKER]: 1 } as never).render())).toBe(0)
  })

  it('are not reported once every row carries a key', () => {
    const children = ['a', 'b', 'c'].map(id => createElement(Row, { key: id }))
    expect(keyReports(as => Div({ as, children, [LIST_MARKER]: 1 } as never).render())).toBe(0)
  })

  it('still render the rows they were given', () => {
    const view = render(Div({ children: ['a', 'b'].map(id => Div({ 'data-testid': `row-${id}`, children: id })), [LIST_MARKER]: 1 } as never).render() as never)
    expect(view.getByTestId('row-a').textContent).toBe('a')
    expect(view.getByTestId('row-b').textContent).toBe('b')
  })

  // Asserted on the element, because neither the DOM nor the console can tell
  // stripped from unstripped here. The `$` makes `__meo$list` an invalid
  // attribute name, so React drops it and the markup comes out clean either
  // way; it logs `Invalid attribute name` instead, but it remembers each name it
  // has complained about, and the cases above have already rendered marked call
  // sites by the time this one runs, so an unstripped marker would produce no
  // output left to catch. What the element carries has no dedupe in front of it.
  it('do not leak the marker into the element, and so never into the DOM', () => {
    const element = Div({ 'data-testid': 'host', children: [Div({ children: 'a' })], [LIST_MARKER]: 1 } as never).render() as {
      props: Record<string, unknown>
    }
    expect(Object.keys(element.props).filter(k => k.startsWith('__meo$'))).toEqual([])

    const view = render(element as never)
    expect(view.getByTestId('host').getAttribute(LIST_MARKER)).toBeNull()
    expect(view.getByTestId('host').outerHTML).not.toContain('__meo$')
  })
})

// The other half of the contract, and the reason detection is opt-in rather
// than "an array means warn": authored siblings must stay as quiet as they are
// in React, where writing them out is exactly what makes keys unnecessary.
//
// These are the cases that catch over-reporting, so each needs a parent of its
// own as much as the cases above do — more, in fact, since a suppressed report
// and a report that never happened look identical from here.
describe('authored children, unmarked', () => {
  it('are never reported, however many there are', () => {
    expect(keyReports(as => Div({ as, children: [createElement(Row), createElement(Row), createElement(Row)] } as never).render())).toBe(0)
  })

  it('are not reported when a sibling is conditional', () => {
    const show = false
    expect(keyReports(as => Div({ as, children: [createElement(Row), show && createElement(Row), createElement(Row)] } as never).render())).toBe(0)
  })

  it('are not reported for a single child or for text', () => {
    expect(keyReports(as => Div({ as, children: createElement(Row) } as never).render())).toBe(0)
    expect(keyReports(as => Div({ as, children: 'plain text' } as never).render())).toBe(0)
  })
})
