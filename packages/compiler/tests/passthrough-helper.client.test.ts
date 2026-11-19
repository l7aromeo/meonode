// @vitest-environment jsdom
//
// Issue #113: a helper hands on the children its caller wrote out. Compiled,
// its inner `Div` must not be marked as a generated list, or React asks for
// keys the written list never needed.
import { describe, expect, it } from 'vitest'
import { compileAndImport, keyReportsOf, WRAPPERS } from './key-warning-harness'

describe('a helper passing its children through, compiled', () => {
  it('leaves the inner call site unmarked and draws no key report', async () => {
    const { code, module } = await compileAndImport(
      `${WRAPPERS}
export default () => Div({ children: [Card({ children: [Span('a'), Span('b')] })] })
`,
      'passthrough-helper',
    )

    expect(code).toContain('__meo$')
    expect(await keyReportsOf(module.default())).toEqual([])
    expect(code).not.toContain('__meo$list')
  })
})
