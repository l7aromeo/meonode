// @vitest-environment jsdom
//
// A keyed list spread in between two written-out children, rendered beside an
// unkeyed generated list of the same element and row type. The two call sites
// look alike from the call itself, so both are told apart by their stacks; only
// the unkeyed one is reported.
import { expect, it } from 'vitest'
import { Div, Span } from '@src/main.js'
import { COMPILED, logged } from './capture'

it('reports only the unkeyed list', () => {
  const { runtime } = logged(
    count =>
      Div({
        children: [
          Div({ children: [Span('a'), ...Array.from({ length: count }, (_, i) => Span(`k${i}`, { key: `k${i}` })), Span('b')] }),
          Div({ children: Array.from({ length: count }, (_, i) => Span(`u${i}`)) }),
        ],
      }).render(),
    [1, 2, 3],
  )
  expect(runtime).toHaveLength(COMPILED ? 0 : 1)
})
