// @vitest-environment node
//
// The memo of names across many server requests in one process, each with a
// style no other request has.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Div } from '@src/main.js'
import { __clearStyleNameMemo, __styleNameMemoSize, STYLE_NAME_MEMO_ENTRIES } from '@src/util/style-name.util.js'

describe('the memo of names across server requests', () => {
  it(`stays within ${STYLE_NAME_MEMO_ENTRIES} names, and each response carries its own rule`, () => {
    __clearStyleNameMemo()
    const REQUESTS = STYLE_NAME_MEMO_ENTRIES + 5000
    let most = 0
    let last = ''
    for (let i = 0; i < REQUESTS; i++) {
      last = renderToString(Div({ css: { paddingLeft: `${i}px` }, children: 'x' }).render())
      most = Math.max(most, __styleNameMemoSize().entries)
    }

    expect(most).toBeLessThanOrEqual(STYLE_NAME_MEMO_ENTRIES)
    expect(last).toContain(`padding-left:${REQUESTS - 1}px;`)
  }, 30_000)
})
