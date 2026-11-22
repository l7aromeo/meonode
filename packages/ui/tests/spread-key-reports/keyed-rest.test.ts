// @vitest-environment jsdom
//
// A keyed list spread in between two children written out, changing length
// between renders. Only the written-out children lack keys, so MeoNode's report
// of an unkeyed generated list has nothing to name, compiled or not.
import { expect, it } from 'vitest'
import { Div, Span } from '@src/main.js'
import { logged } from './capture'

it('is not reported as a list without keys', () => {
  const { runtime } = logged(
    count => {
      const rest = Array.from({ length: count }, (_, i) => Span(`r${i}`, { key: `r${i}` }))
      return Div({ children: [Span('a'), ...rest, Span('b')] }).render()
    },
    [1, 2, 3],
  )
  expect(runtime).toEqual([])
})
