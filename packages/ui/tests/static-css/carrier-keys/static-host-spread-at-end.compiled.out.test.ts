// @vitest-environment jsdom
//
// The key warnings of one run, in a file of its own: a counter, a static host, then the spread at the end, unkeyed, its
// css compiled, with the spread out at first. Compiled, the children
// reach React as the array written, so the spread's unkeyed items get React's
// warning, as each side's does; uncompiled, none.
import { expect, it } from 'vitest'
import { COMPILED, counterWarnings } from './_count.js'

it('gives React’s key warning as its other side does', () => {
  expect(counterWarnings('a counter, a static host, then the spread at the end', 'compiled', false, false)).toBe(COMPILED ? 1 : 0)
})
