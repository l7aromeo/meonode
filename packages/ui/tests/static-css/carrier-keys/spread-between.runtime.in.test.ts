// @vitest-environment jsdom
//
// The key warnings of one run, in a file of its own: a counter, the spread, a counter, unkeyed, its
// css on the runtime path, with the spread in at first. Compiled, the children
// reach React as the array written, so the spread's unkeyed items get React's
// warning, as each side's does; uncompiled, none.
import { expect, it } from 'vitest'
import { COMPILED, counterWarnings } from './_count.js'

it('gives React’s key warning as its other side does', () => {
  expect(counterWarnings('a counter, the spread, a counter', 'runtime', false, true)).toBe(COMPILED ? 1 : 0)
})
