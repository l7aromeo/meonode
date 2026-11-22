// @vitest-environment jsdom
//
// A keyed list and an unkeyed one spread side by side, the unkeyed one changing
// length between renders. Some children have keys, yet the generated rows that
// change in number do not, so the list is still reported.
import { expect, it } from 'vitest'
import { Div, Span } from '@src/main.js'
import { COMPILED, logged } from './capture'

it('is still reported', () => {
  const { runtime, react } = logged(
    count => {
      const keyed = [Span('k0', { key: 'k0' }), Span('k1', { key: 'k1' })]
      const unkeyed = Array.from({ length: count }, (_, i) => Span(`u${i}`))
      return Div({ children: [...keyed, ...unkeyed] }).render()
    },
    [1, 2, 3],
  )
  expect(runtime).toHaveLength(COMPILED ? 0 : 1)
  expect(react).toHaveLength(COMPILED ? 1 : 0)
})
