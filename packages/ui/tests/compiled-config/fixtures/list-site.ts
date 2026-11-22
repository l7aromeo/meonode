// A file for stale-transform.test.ts to compile: one call site whose children
// are a generated list, which the compiler marks.
import { Div } from '@src/main.js'
import { it } from 'vitest'

const items = [1, 2]

it('builds a node with a generated list', () => {
  Div({ children: items.map(item => Div({ children: String(item) })) })
})
