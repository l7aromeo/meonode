// @vitest-environment jsdom
//
// SPEC — failing until the runtime consumes the list marker.
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
// written with the marker set by hand, exactly as the compiled fast-path tests
// are. That keeps them meaningful in both plain and compiled runs.
import { Div } from '@src/main.js'
import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

// The key the compiler will set on a call site whose `children` expression was
// generated rather than written out. Local to the spec on purpose: when the
// runtime exports it, this constant is replaced by that import and the spec
// starts asserting against the real contract.
const LIST_MARKER = '__meo$list'

afterEach(cleanup)

let uid = 0
/** React reports a missing key once per component type, so each case needs its own. */
const freshType = () => {
  const T = () => createElement('i', null, 'x')
  Object.defineProperty(T, 'name', { value: 'Row' + ++uid })
  return T
}

function keyReports(build: () => unknown): number {
  const seen: string[] = []
  const err = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' ')))
  const warn = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' ')))
  try {
    render(build() as never)
  } finally {
    err.mockRestore()
    warn.mockRestore()
  }
  return seen.filter(m => /\bkey\b/i.test(m)).length
}

describe('generated children, as marked by the compiler', () => {
  it('are reported when they carry no key', () => {
    const T = freshType()
    const children = ['a', 'b', 'c'].map(() => createElement(T))
    expect(keyReports(() => Div({ children, [LIST_MARKER]: 1 } as never).render())).toBeGreaterThan(0)
  })

  it('are not reported once every row carries a key', () => {
    const T = freshType()
    const children = ['a', 'b', 'c'].map(id => createElement(T, { key: id }))
    expect(keyReports(() => Div({ children, [LIST_MARKER]: 1 } as never).render())).toBe(0)
  })

  it('still render the rows they were given', () => {
    const view = render(Div({ children: ['a', 'b'].map(id => Div({ 'data-testid': `row-${id}`, children: id })), [LIST_MARKER]: 1 } as never).render() as never)
    expect(view.getByTestId('row-a').textContent).toBe('a')
    expect(view.getByTestId('row-b').textContent).toBe('b')
  })

  // Asserted on the element rather than on the rendered markup, because the DOM
  // cannot tell stripped from unstripped: the `$` makes `__meo$list` an invalid
  // attribute name, so React drops it and logs `Invalid attribute name` instead.
  // The markup therefore comes out clean either way, and the real cost of failing
  // to strip is that console line — on the same channel the key reports use.
  //
  // The console is no use as the guard here either. React remembers each bad
  // attribute name it has complained about and stays quiet afterwards, and the
  // cases above have already rendered marked call sites by the time this one
  // runs, so an unstripped marker would produce no output at all to catch. What
  // the element carries is the one signal with no dedupe in front of it.
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
describe('authored children, unmarked', () => {
  it('are never reported, however many there are', () => {
    const T = freshType()
    expect(keyReports(() => Div({ children: [createElement(T), createElement(T), createElement(T)] }).render())).toBe(0)
  })

  it('are not reported when a sibling is conditional', () => {
    const T = freshType()
    const show = false
    expect(keyReports(() => Div({ children: [createElement(T), show && createElement(T), createElement(T)] }).render())).toBe(0)
  })

  it('are not reported for a single child or for text', () => {
    const T = freshType()
    expect(keyReports(() => Div({ children: createElement(T) }).render())).toBe(0)
    expect(keyReports(() => Div({ children: 'plain text' }).render())).toBe(0)
  })
})
