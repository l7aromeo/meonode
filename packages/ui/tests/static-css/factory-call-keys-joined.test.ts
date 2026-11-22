// @vitest-environment jsdom
//
// An unkeyed list of joined calls reports its missing key as the calls
// uncompiled do (factory-call-keys-plain.test.ts): a joined call is a node like
// any other to the key check, which no compiled marker it carries silences.
import { expect, it } from 'vitest'
import { __meoFactoryCall } from '@src/main.js'
import { STATIC_NAME_MARKER } from '@src/constant/common.const.js'
import { expectListReport, Panel } from './_factory-call-keys.js'

const site = { at: 0 }

it('reports an unkeyed list of joined calls once, as uncompiled', () => {
  expectListReport(props => {
    const node = __meoFactoryCall(Panel, site, props) as ReturnType<typeof Panel>
    // Joined, so the list is of named nodes.
    expect((node.props as Record<string, unknown>)[STATIC_NAME_MARKER]).toBeDefined()
    return node
  })
})
