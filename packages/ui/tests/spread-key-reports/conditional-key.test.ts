// @vitest-environment jsdom
//
// A written-out array whose first member's key comes and goes between renders.
// Its length never changes, so nothing calls it a generated list.
import { expect, it } from 'vitest'
import { Div, Span } from '@src/main.js'
import { logged } from './capture'

it('is not reported', () => {
  const { runtime, react } = logged(count => Div({ children: [Span('a', { key: count % 2 ? 'a' : undefined }), Span('b')] }).render(), [1, 2, 3])
  expect(runtime).toEqual([])
  expect(react).toEqual([])
})
