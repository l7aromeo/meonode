// @vitest-environment jsdom
//
// The key warnings of one run, in a file of its own: the generated list of
// items each holding a component, unkeyed, its css on the runtime path. Through its
// appends, removals and reorders React warns once, compiled or not.
import { expect, it } from 'vitest'
import { listWarnings } from './_count.js'

it('gives React’s key warning once', () => {
  expect(listWarnings('runtime', false)).toBe(1)
})
