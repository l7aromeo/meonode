// @vitest-environment jsdom
//
// An unkeyed list spread in between two children written out, changing length
// between renders. The rows lack keys: uncompiled, MeoNode's runtime report
// names the list; compiled, the call site is marked and React's own check does.
import { expect, it } from 'vitest'
import { Div, Span } from '@src/main.js'
import { COMPILED, logged } from './capture'

it('is reported once, by whichever check sees it', () => {
  const { runtime, react } = logged(
    count => {
      const rest = Array.from({ length: count }, (_, i) => Span(`r${i}`))
      return Div({ children: [Span('a'), ...rest, Span('b')] }).render()
    },
    [1, 2, 3],
  )
  expect(runtime).toHaveLength(COMPILED ? 0 : 1)
  expect(react).toHaveLength(COMPILED ? 1 : 0)
})
