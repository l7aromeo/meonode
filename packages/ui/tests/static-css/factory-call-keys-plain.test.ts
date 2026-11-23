// @vitest-environment jsdom
//
// An unkeyed list of a factory's calls uncompiled: the report a list of joined
// calls must match (factory-call-keys-joined.test.ts).
import { it } from 'vitest'
import { expectListReport, Panel } from './_factory-call-keys.js'

it('reports an unkeyed list of calls once', () => {
  expectListReport(props => Panel(props))
})
