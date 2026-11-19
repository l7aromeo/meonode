// @vitest-environment jsdom
//
// The control for the pass-through cases: the same harness must still see the
// report for a list a `.map()` generates without keys, including when that
// list reaches the wrapper through a local binding. Without this, a harness
// that saw no reports at all would pass every pass-through case.
import { describe, expect, it } from 'vitest'
import { compileAndImport, keyReportsOf, WRAPPERS } from './key-warning-harness'

describe('a generated list without keys, compiled', () => {
  it('is marked and draws a key report', async () => {
    const { code, module } = await compileAndImport(
      `${WRAPPERS}
function List({ labels }: { labels: string[] }) {
  const items = labels.map(label => Span(label))
  return Div({ children: items }).render()
}
export default () => Div({ children: [Node(List, { labels: ['a', 'b'] })] })
`,
      'passthrough-generated-control',
    )

    expect(code).toContain('__meo$list')
    expect(await keyReportsOf(module.default())).toHaveLength(1)
  })
})
