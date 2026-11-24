// @vitest-environment jsdom
//
// The runs that give no key warning in any mode: every keyed run, and the
// unkeyed conditionals, whose children reach React as written positions. They
// share a file: the first that gave a warning would fail before React's once
// per host could hide a later one.
import { describe, expect, it } from 'vitest'
import { CASES } from '../_carrier-pages.js'
import { counterWarnings, listWarnings } from './_count.js'

const CONDITIONALS = [
  'a conditional static host, then a counter',
  'a conditional counter, then a counter',
  'a conditional counter, a static host, a counter',
  'a counter, a conditional static host, a counter',
]

describe.each([
  ['runtime', 'runtime'],
  ['compiled', 'compiled'],
] as const)('with its css %s', (_, side) => {
  it.each(Object.keys(CASES))('keyed, %s, gives none either way it starts', name => {
    expect(counterWarnings(name, side, true, true)).toBe(0)
    expect(counterWarnings(name, side, true, false)).toBe(0)
  })
  it('keyed, the generated list gives none', () => {
    expect(listWarnings(side, true)).toBe(0)
  })
  it.each(CONDITIONALS)('unkeyed, %s, gives none either way it starts', name => {
    expect(counterWarnings(name, side, false, true)).toBe(0)
    expect(counterWarnings(name, side, false, false)).toBe(0)
  })
})
