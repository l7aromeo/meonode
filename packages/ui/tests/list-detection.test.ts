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
import { Div, Node, Section } from '@src/main.js'
import { cleanup, render } from '@testing-library/react'
import { createElement, Fragment, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The key the compiler sets on a call site whose `children` expression was
// generated rather than written out. Local to the spec on purpose: when the
// runtime exports it, this constant is replaced by that import and the spec
// starts asserting against the real contract.
const LIST_MARKER = '__meo$list'

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
  return seen.filter(m => /unique "key"/i.test(m)).length
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

  // `processProps` has a fast path for a call site with nothing left over after
  // the marker is stripped — `Section({ children, ... })` and no other props —
  // and it calls `_processChildren` from a second place. Keeping a marked
  // one-element array is decided at each of those call sites separately, so a
  // case that reaches one says nothing about the other. Every other case in this
  // file passes `as` to get its own parent tag, which is itself a leftover prop
  // and sends them all down the general path; this one cannot do that and stay
  // on the fast path, so it takes its parent from the factory instead. `section`
  // is used by no other case here, which is what the custom tags elsewhere are
  // for — if a second case ever needs it, give one of them a different factory.
  it('are reported on a one-row list whose call site has no other props', () => {
    const children = ['only'].map(() => createElement(Row))
    expect(keyReports(() => Section({ children, [LIST_MARKER]: 1 } as never).render())).toBeGreaterThan(0)
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

  // An empty generated list — `items.map(fn)` over nothing, as common as lists
  // get — must reach the element exactly as it did before any of this: passed
  // as no child arguments at all, not as one argument holding an empty array.
  //
  // Asserted on a function component and a void element because a host element
  // cannot show the difference: `<div>` with `children: []` renders the same as
  // `<div>` with none, which is why a whole suite of them stays green while this
  // is broken. What changes is `props.children` — `undefined` becomes `[]`, so
  // `children ?? fallback` stops firing and `children && ...` starts passing,
  // both at the exact moment a component wanted its empty state.
  describe('an empty generated list', () => {
    it('leaves children undefined, so a component still sees its empty state', () => {
      let seen: unknown = 'unset'
      const Probe = ({ children }: { children?: ReactNode }) => {
        seen = children
        return createElement('i', null, (children ?? 'EMPTY STATE') as ReactNode)
      }
      const view = render(Div({ as: Probe, children: [], [LIST_MARKER]: 1 } as never).render() as never)
      expect(seen).toBeUndefined()
      expect(view.container.textContent).toBe('EMPTY STATE')
    })

    it('does not hand a void element a child argument to reject', () => {
      expect(() => render(Div({ as: 'img', children: [], [LIST_MARKER]: 1 } as never).render() as never)).not.toThrow()
    })

    it('is still reported once it has a row', () => {
      const children = ['only'].map(() => createElement(Row))
      expect(keyReports(as => Div({ as, children, [LIST_MARKER]: 1 } as never).render())).toBeGreaterThan(0)
    })
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
  //
  // Honest about its reach: for `__meo$list` itself this cannot fail, because
  // `BaseNode.render` destructures the marker off before `otherProps` is built,
  // so it is absent from the element whether or not `processProps` stripped it —
  // and the legacy path deliberately re-adds it to `FinalNodeProps` as the
  // carrier. What it does catch is a `__meo$` / `c` / `d` / `k` key surviving
  // the compiled path, which the assertion it replaced caught nothing of.
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

// A Fragment reaches a different `createElement` call in `BaseNode.render` from
// every other node, and rendering a list without a wrapper element is ordinary.
// That call site had no coverage: spreading `finalChildren` there instead of
// `childArguments` broke nothing in the suite.
//
// Only ONE case here can assert a report. React keys the missing-key budget on
// the parent's component name, and every Fragment answers to the same one — a
// second Fragment-parented list is silent however fresh its rows are, which is
// measured, not assumed. The keyed case is safe in any order because React
// spends the budget only when it actually reports.
describe('a generated list under a Fragment', () => {
  it('is reported when its rows carry no key', () => {
    const children = [0, 1, 2].map(() => createElement(Row))
    expect(keyReports(() => Node(Fragment, { children, [LIST_MARKER]: 1 } as never).render())).toBeGreaterThan(0)
  })

  it('is silent once every row carries a key', () => {
    const children = ['a', 'b', 'c'].map(id => createElement(Row, { key: id }))
    expect(keyReports(() => Node(Fragment, { children, [LIST_MARKER]: 1 } as never).render())).toBe(0)
  })

  it('renders an empty generated list without handing React a child to reject', () => {
    const view = render(Node(Fragment, { children: [], [LIST_MARKER]: 1 } as never).render() as never)
    expect(view.container.innerHTML).toBe('')
  })
})

// Duplicate keys are where a reader lands after keying by a field that is not
// unique, and React's response is easy to guess wrong: it complains and renders
// every row anyway, rather than dropping or merging them.
//
// Honest about what this is: a characterization test of React, not a guard on
// our call sites. Verified by mutation — with the marker never acted on, it
// still passes, because duplicate detection happens in the reconciler whether
// children arrived as one array or as separate arguments. It is here so the
// distinction between the two key warnings is written down and so a future
// change that started losing rows would be caught, not because it defends the
// marker.
describe('duplicate keys on a generated list', () => {
  it('are reported as duplicates, not as missing, and lose no rows', () => {
    const seen: string[] = []
    const err = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' ')))
    const warn = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' ')))
    let view
    try {
      view = render(
        Div({
          as: freshParent(),
          [LIST_MARKER]: 1,
          children: ['same', 'same', 'other'].map(id => createElement(Row, { key: id })),
        } as never).render() as never,
      )
    } finally {
      err.mockRestore()
      warn.mockRestore()
    }
    expect(seen.filter(m => /two children with the same key/i.test(m))).not.toEqual([])
    expect(seen.filter(m => /unique "key"/i.test(m))).toEqual([])
    expect(view.container.querySelectorAll('i')).toHaveLength(3)
  })
})

// Nesting matters because the marker is per call site, and a reader will have
// one generated list inside another long before they think about it.
describe('a generated list inside a generated list', () => {
  it('reports the inner list on its own account', () => {
    const outer = freshParent()
    const inner = freshParent()
    const reports = keyReports(() =>
      Div({
        as: outer,
        [LIST_MARKER]: 1,
        children: [0, 1].map(i => Div({ as: inner, key: `o${i}`, [LIST_MARKER]: 1, children: [0, 1].map(() => createElement(Row)) } as never)),
      } as never).render(),
    )
    expect(reports).toBeGreaterThan(0)
  })

  it('does not let an outer marking reach an inner call site that was authored', () => {
    const outer = freshParent()
    const inner = freshParent()
    // The outer list is generated and unkeyed, so it reports — once, for its own
    // parent. The inner children are written out at their own call site and
    // carry no marker, so they must stay silent. Two reports would mean the
    // outer marking had been applied to children it does not describe.
    const reports = keyReports(() =>
      Div({
        as: outer,
        [LIST_MARKER]: 1,
        children: [0, 1].map(() => Div({ as: inner, children: [createElement(Row), createElement(Row)] } as never)),
      } as never).render(),
    )
    expect(reports).toBe(1)
  })
})
