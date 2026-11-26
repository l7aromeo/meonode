// @vitest-environment jsdom
//
// The note beside React's missing-key warning for a marked list, word for word,
// in development, where React makes that warning. The production note, which has
// no warning to sit beside, is checked in build-output.test.ts.
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { Div, Span } from '@src/main.js'
import { logged } from './capture'

const unkeyedRows = () => ['a', 'b'].map(item => Span(item, { __meo$: 3, __meo$list: 1 } as never))
const withHeading = () => [createElement('h2', { key: 'h' }, 'Members'), ...unkeyedRows()]

/** The hints one render of a marked list logs. */
const hints = (props: Record<string, unknown>) => logged(() => Div({ __meo$: 2, __meo$list: 1, ...props } as never).render(), [1]).hint

const SPREAD =
  ' Some children here do have keys: a spread puts a generated list and the siblings written beside it into one list, so React asks those siblings for keys too. Nest the generated part instead of spreading it.'

describe('the note in development', () => {
  it('names the call site of a list without keys', () => {
    expect(hints({ __meo$k: 'm-text-a', __meo$loc: 'src/a.ts:1:1', children: unkeyedRows() })).toEqual([
      '[MeoNode] A generated list at src/a.ts:1:1 has children without a `key`. React reports the missing key itself; this names the call site it came from.',
    ])
  })

  it('names the call site of a list spread beside keyed children, and says so', () => {
    expect(hints({ __meo$k: 'm-text-b', __meo$loc: 'src/b.ts:2:2', children: withHeading() })).toEqual([
      `[MeoNode] A generated list at src/b.ts:2:2 has children without a \`key\`. React reports the missing key itself; this names the call site it came from.${SPREAD}`,
    ])
  })

  it('explains a list spread beside keyed children without a location', () => {
    expect(hints({ __meo$k: 'm-text-c', children: withHeading() })).toEqual([
      `[MeoNode] A generated list has children without a \`key\`.${SPREAD} Turn on \`callSiteLocations\` in the @meonode/compiler plugin options to have this name the file and line.`,
    ])
  })

  it('leaves a list without keys and without a location to React', () => {
    expect(hints({ __meo$k: 'm-text-d', children: unkeyedRows() })).toEqual([])
  })
})
