// @vitest-environment jsdom
//
// MeoNode's note beside React's missing-key warning for a marked list is logged
// once per call site, as React logs its own warning once, however often the
// call site renders. Other call sites still get theirs.
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { Div, Section, Span } from '@src/main.js'
import { COMPILED, logged } from './capture'
import { __generatedListState, __resetGeneratedListReport, noteOnce } from '@src/util/generated-list.util.js'

const keyedRows = (count: number) => Array.from({ length: count }, (_, i) => Span(`r${i}`, { key: `r${i}` }))
const unkeyedRows = (count: number) => Array.from({ length: count }, (_, i) => Span(`r${i}`))
const heading = () => createElement('h2', null, 'Members')

/** Renders three times, with one to three rows. */
const COUNTS = [1, 2, 3]

describe('a call site the compiler marked by hand', () => {
  it('logs the spread note once', () => {
    const { hint } = logged(
      count => Div({ __meo$: 2, __meo$k: 'm-hint-a', __meo$list: 1, children: [heading(), ...keyedRows(count)] } as never).render(),
      COUNTS,
    )
    expect(hint).toHaveLength(1)
  })

  it('logs the located note once', () => {
    const { hint } = logged(count => Div({ __meo$list: 1, __meo$loc: 'app/page.tsx:3:1', children: unkeyedRows(count) } as never).render(), COUNTS)
    expect(hint).toHaveLength(1)
  })

  it('logs it for each call site', () => {
    const { hint } = logged(
      count =>
        Div({
          children: [
            Div({ __meo$: 2, __meo$k: 'm-hint-b', __meo$list: 1, children: [heading(), ...keyedRows(count)] } as never),
            Div({ __meo$: 2, __meo$k: 'm-hint-c', __meo$list: 1, children: [heading(), ...keyedRows(count)] } as never),
          ],
        }).render(),
      COUNTS,
    )
    expect(hint).toHaveLength(2)
  })

  // A call site whose marker names neither its key nor its location, as one
  // synthesized for `Span(list)` does, is told apart by what it renders.
  it('logs it once for a call site that names neither key nor location', () => {
    const { hint } = logged(count => Section({ __meo$: 3, __meo$list: 1, children: [heading(), ...keyedRows(count)] } as never).render(), COUNTS)
    expect(hint).toHaveLength(1)
  })
})

it('logs the note once for the shape written out, when compiled', () => {
  const { hint } = logged(count => {
    const rest = keyedRows(count)
    return Div({ children: [Span('a'), ...rest, Span('b')] }).render()
  }, COUNTS)
  expect(hint).toHaveLength(COMPILED ? 1 : 0)
})

it('remembers a bounded number of call sites', () => {
  __resetGeneratedListReport()
  // A reloaded module's call sites come back with new locations.
  for (let i = 0; i < 2500; i++) noteOnce(`app/page.tsx:${i}:1`, undefined, 'div')
  const { noted } = __generatedListState()
  expect(noted).toBeGreaterThan(0)
  expect(noted).toBeLessThanOrEqual(2000)
})
