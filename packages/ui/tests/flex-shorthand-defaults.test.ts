import { Div, Span } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { cleanup, render } from '@testing-library/react'
import type { CSSProperties } from '@emotion/serialize'

// Style tags are left in place: Emotion inserts a class once per cache, so removing
// them would leave a later test that reuses a class with no rule to read.
afterEach(cleanup)

type SpanStyle = NonNullable<Parameters<typeof Span>[1]>

/**
 * Every `flex-shrink` value in the rule Emotion emitted for the rendered span, in
 * emission order. Read from the style text rather than the CSSOM or a style-rule
 * matcher: the defect is one declaration following another, and both of those
 * collapse duplicates before a test can see the order.
 */
const emittedFlexShrink = (style: SpanStyle): string[] => {
  const { container } = render(Div({ display: 'flex', children: Span('x', style) }).render())
  const className = [...container.querySelector('span')!.classList].find(c => c.startsWith('css-'))!
  const css = [...document.head.querySelectorAll('style')].map(s => s.textContent).join('')
  const rule = css.match(new RegExp(`\\.${className}\\{([^}]*)\\}`))?.[1]
  if (rule === undefined) throw new Error(`no rule emitted for .${className}`)
  return [...rule.matchAll(/(?:^|;)flex-shrink:([^;]+)/g)].map(m => m[1])
}

describe('flex shorthand and the default flex-shrink', () => {
  describe('a parseable shorthand sets flex-shrink to its own shrink factor', () => {
    it.each<[CSSProperties['flex'], string]>([
      ['1 1 auto', '1'],
      ['1 0 auto', '0'],
      ['1 30px', '1'],
      ['1 2', '2'],
      ['30px', '1'],
      ['30px 2', '1'],
      ['30px 2 3', '3'],
      ['2 3 10%', '3'],
      ['1 1 0', '1'],
      ['1 1 calc(100% - 8px)', '1'],
      ['content', '1'],
      ['0', '1'],
      [0, '1'],
    ])('flex: %j emits flex-shrink %s last', (flex, shrink) => {
      expect(emittedFlexShrink({ flex })).toEqual([shrink])
    })

    it('holds inside a flex container whose own default would be 0', () => {
      expect(emittedFlexShrink({ display: 'flex', flexDirection: 'column', flex: '1 1 auto' })).toEqual(['1'])
    })
  })

  describe('an unparseable shorthand gets no default flex-shrink at all', () => {
    it.each(['var(--flex)', 'inherit', '1 2 3 4', '-1'])('flex: %j', flex => {
      expect(emittedFlexShrink({ flex })).toEqual([])
    })
  })

  // Values the shorthand parser does not decide: flex keywords, explicit flexShrink,
  // and the container defaults.
  describe('values the shorthand parser does not decide', () => {
    it.each<[string, SpanStyle, string[]]>([
      ['flex: 1', { flex: 1 }, ['1']],
      ["flex: 'auto'", { flex: 'auto' }, ['1']],
      ["flex: 'none'", { flex: 'none' }, ['0']],
      ["flex: 'initial'", { flex: 'initial' }, ['1']],
      ['explicit flexShrink', { flexShrink: 2 }, ['2']],
      ['explicit flexShrink over a shorthand', { flex: '1 1 auto', flexShrink: 3 }, ['3']],
      ['row container', { display: 'flex' }, ['0']],
      ['column container', { display: 'flex', flexDirection: 'column' }, ['0']],
      ['row-reverse inline container', { display: 'inline-flex', flexDirection: 'row-reverse' }, ['0']],
      ['wrapping container', { display: 'flex', flexWrap: 'wrap' }, []],
      ['flexFlow wrapping container', { display: 'flex', flexFlow: 'column wrap' }, []],
      ['scrolling container', { display: 'flex', overflow: 'auto' }, []],
      ['column container scrolling on y', { display: 'flex', flexDirection: 'column', overflowY: 'auto' }, []],
      ['flex item with no flex props', { color: 'red' }, ['0']],
    ])('%s', (_, style, shrink) => {
      expect(emittedFlexShrink(style)).toEqual(shrink)
    })
  })

  describe('parseFlexShorthand', () => {
    it.each<[CSSProperties['flex'], ReturnType<typeof ThemeUtil.parseFlexShorthand>]>([
      [1, { grow: 1, shrink: 1, basis: '0%' }],
      ['2', { grow: 2, shrink: 1, basis: '0%' }],
      ['30px', { grow: 1, shrink: 1, basis: '30px' }],
      ['1 2', { grow: 1, shrink: 2, basis: '0%' }],
      ['1 30px', { grow: 1, shrink: 1, basis: '30px' }],
      ['30px 2', { grow: 2, shrink: 1, basis: '30px' }],
      ['1 0 auto', { grow: 1, shrink: 0, basis: 'auto' }],
      ['auto 1 0', { grow: 1, shrink: 0, basis: 'auto' }],
      ['1 1 0', { grow: 1, shrink: 1, basis: '0' }],
      ['  1   0.5   calc(50% - 4px) ', { grow: 1, shrink: 0.5, basis: 'calc(50% - 4px)' }],
      ['1 2 3', null],
      ['1 auto auto', null],
      ['1 -1', null],
      [-1, null],
      ['var(--flex)', null],
      ['1 var(--shrink)', null],
      ['unset', null],
      ['1 1 calc(100% - 8px', null],
    ])('%j → %j', (flex, expected) => {
      expect(ThemeUtil.parseFlexShorthand(flex)).toEqual(expected)
    })
  })
})
