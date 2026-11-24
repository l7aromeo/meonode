// @vitest-environment jsdom
//
// A compiled call site of a layout factory (`Row`, `Column`, …) whose initial
// props the compiler merged itself. It marks the call site with a fingerprint of
// what it merged, `__meo$i`, and the factory then uses the props as given rather
// than merging its initial props in again, which would bring them back as
// runtime css and keep the element from being plain. A call site the compiler
// did not merge, or merged against other initial props, merges as before.
import { serializeStyles } from '@emotion/serialize'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { Center, Column, createChildrenFirstNode, createNode, Div, Row, type NodeInstance } from '@src/main.js'
import StyledRenderer from '@src/components/styled-renderer.client.js'
import { initialPropsFingerprint } from '@src/core.node.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'

/** The marker props of a call site whose whole style the compiler named: the factory's initial props merged in front of its own. */
function named(css: Record<string, unknown>): Record<string, unknown> {
  const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const { name, styles } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  registerStaticCss(`m-${name}`, [[name, styles]])
  return { __meo$: 2, __meo$n: name }
}

const ROW_STYLE = { display: 'flex', flexDirection: 'row' }
const ROW_FINGERPRINT = '{k7:displays4:flexk13:flexDirections3:row}'
const COLUMN_FINGERPRINT = '{k7:displays4:flexk13:flexDirections6:column}'
const FLEX_FINGERPRINT = '{k7:displays4:flex}'

/** The css a node renders with on the runtime path, after its factory's merge. */
const runtimeCss = (node: NodeInstance) => (node.props as { css?: Record<string, unknown> }).css ?? {}

/**
 * The element `child` renders as, rendered inside a component, where an
 * app's walk runs, and after a runtime node, so a named child follows its rule.
 */
function renderedChild(child: () => NodeInstance): ReactElement<Record<string, unknown>> {
  let parent: ReactElement<{ children?: unknown }> | undefined
  renderToString(
    createElement(function Page() {
      parent = Div({ css: { order: 0 }, children: [child()] }).render() as ReactElement<{ children?: unknown }>
      return parent
    }),
  )
  let rendered = parent!.props.children
  while (Array.isArray(rendered)) rendered = rendered[0]
  return rendered as ReactElement<Record<string, unknown>>
}

/** `Row({ children: 'x' })` as the compiler names it, with `fingerprint` as its marker. */
const markedRow = (fingerprint: unknown, rest: Record<string, unknown> = {}) =>
  Row({ ...named(ROW_STYLE), __meo$i: fingerprint, children: 'x', ...rest } as never)

afterEach(() => __resetStaticCss())

describe('the fingerprint of a factory’s initial props', () => {
  it('is its entries in written order, each key and string length-prefixed in UTF-16 code units', () => {
    expect(initialPropsFingerprint({ display: 'flex', flexDirection: 'row' })).toBe('{k7:displays4:flexk13:flexDirections3:row}')
    expect(initialPropsFingerprint({ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' })).toBe(
      '{k7:displays4:flexk13:flexDirections6:columnk10:alignItemss6:centerk14:justifyContents6:center}',
    )
    expect(initialPropsFingerprint({ content: '😀→' })).toBe('{k7:contents3:😀→}')
    expect(initialPropsFingerprint({})).toBe('{}')
  })

  // The order decides the merged text, and so the name, so two orders are two fingerprints.
  it('tells two orders of the same entries apart', () => {
    expect(initialPropsFingerprint({ color: 'red', padding: 4 })).not.toBe(initialPropsFingerprint({ padding: 4, color: 'red' }))
  })

  it('takes keys in the order JavaScript gives them, integer-like keys first', () => {
    expect(initialPropsFingerprint({ b: 1, 2: 'x' })).toBe('{k1:2s1:xk1:bn1;}')
  })

  it('writes a number as JavaScript does', () => {
    expect(initialPropsFingerprint({ flexGrow: 1, opacity: 0.5, zIndex: -2, lineHeight: 1e21 })).toBe(
      '{k8:flexGrown1;k7:opacityn0.5;k6:zIndexn-2;k10:lineHeightn1e+21;}',
    )
  })

  it('writes nested maps, booleans and null, with keys that hold : and ;', () => {
    expect(initialPropsFingerprint({ css: { '&:hover': { color: 'red' }, '--x': 'a;b' }, hidden: true, wrap: false, title: null })).toBe(
      '{k3:css{k7:&:hover{k5:colors3:red}k3:--xs3:a;b}k6:hiddentk4:wrapfk5:titlez}',
    )
  })

  it('gives different entries different fingerprints, however their texts run together', () => {
    const pairs: [Record<string, unknown>, Record<string, unknown>][] = [
      [{ ab: 'c' }, { a: 'bc' }],
      [{ a: 's1:b' }, { a: 's', '1:b': '' }],
      [{ a: '1' }, { a: 1 }],
      [{ a: null }, { a: 'z' }],
      [{ a: { b: 'c' } }, { a: '{k1:bs1:c}' }],
    ]
    for (const [one, other] of pairs) expect(initialPropsFingerprint(one)).not.toBe(initialPropsFingerprint(other))
  })

  it('is none for a value it cannot write exactly', () => {
    expect(initialPropsFingerprint({ css: { color: () => 'red' } })).toBeUndefined()
    expect(initialPropsFingerprint({ margin: ['1px', '2px'] })).toBeUndefined()
    expect(initialPropsFingerprint({ color: undefined })).toBeUndefined()
    expect(initialPropsFingerprint({ opacity: Number.NaN })).toBeUndefined()
    expect(initialPropsFingerprint({ opacity: Number.POSITIVE_INFINITY })).toBeUndefined()
    expect(initialPropsFingerprint({ when: new Date(0) })).toBeUndefined()
    expect(initialPropsFingerprint({ [Symbol('s')]: 'x' })).toBeUndefined()
    expect(initialPropsFingerprint(undefined)).toBeUndefined()
  })
})

describe('a marked call site', () => {
  it('uses its props as given when the fingerprint is the factory’s, and renders plain', () => {
    expect(runtimeCss(markedRow(ROW_FINGERPRINT))).toEqual({})
    const element = renderedChild(() => markedRow(ROW_FINGERPRINT))
    expect(element.type).toBe('div')
    expect(element.props.className).toMatch(/^css-/)
  })

  it('merges as before when the fingerprint is another factory’s', () => {
    expect(runtimeCss(markedRow(COLUMN_FINGERPRINT))).toMatchObject(ROW_STYLE)
    expect(renderedChild(() => markedRow(COLUMN_FINGERPRINT)).type).toBe(StyledRenderer)
  })

  it('merges as before when the marker is not a string', () => {
    expect(runtimeCss(markedRow(1))).toMatchObject(ROW_STYLE)
  })

  it('works for every built-in layout factory with its own fingerprint', () => {
    for (const [factory, initial, fingerprint] of [
      [Column, { display: 'flex', flexDirection: 'column' }, COLUMN_FINGERPRINT],
      [
        Center,
        { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
        '{k7:displays4:flexk13:flexDirections6:columnk10:alignItemss6:centerk14:justifyContents6:center}',
      ],
    ] as const) {
      expect(runtimeCss(factory({ ...named(initial), __meo$i: fingerprint } as never))).toEqual({})
      expect(renderedChild(() => factory({ ...named(initial), __meo$i: fingerprint } as never)).type).toBe('div')
    }
  })

  it('keeps its own css as written, with nothing of the factory composed in', () => {
    const custom = createNode('div', { display: 'flex' })
    // Props as a value, not a literal, so a compiled run of this suite leaves the call sites as they are.
    const markedProps = { ...named({ display: 'flex' }), __meo$i: FLEX_FINGERPRINT, css: { color: 'red' } }
    const unmarkedProps = { ...named({ display: 'flex' }), css: { color: 'red' } }
    const marked = custom(markedProps as never)
    const unmarked = custom(unmarkedProps as never)

    expect(runtimeCss(marked)).toEqual({ color: 'red' })
    expect(runtimeCss(unmarked)).toEqual({ display: 'flex', color: 'red' })
  })

  it('uses its props as given for a factory whose defaults hold a css map', () => {
    const Card = createNode('div', { padding: 4, css: { '&:hover': { color: 'red' } } })
    const fingerprint = '{k7:paddingn4;k3:css{k7:&:hover{k5:colors3:red}}}'
    expect(initialPropsFingerprint({ padding: 4, css: { '&:hover': { color: 'red' } } })).toBe(fingerprint)
    // Props as a value, not a literal, so a compiled run of this suite leaves the call sites as they are.
    const marked = { ...named({ padding: 4, '&:hover': { color: 'red' } }), __meo$i: fingerprint }
    const unmarked = { ...named({ padding: 4, '&:hover': { color: 'red' } }) }
    expect(runtimeCss(Card(marked as never))).toEqual({})
    expect(runtimeCss(Card(unmarked as never))).toEqual({ padding: 4, '&:hover': { color: 'red' } })
  })

  it('works for a children-first factory too', () => {
    const P = createChildrenFirstNode('p', { display: 'flex' })
    const props = { ...named({ display: 'flex' }), __meo$i: FLEX_FINGERPRINT }
    const element = renderedChild(() => P('x', props as never))

    expect(element.type).toBe('p')
    expect(element.props.children).toBe('x')
  })

  it('merges as before for a factory with no fingerprint', () => {
    const custom = createNode('div', { css: { color: 'red' } })
    expect(runtimeCss(custom({ ...named({ color: 'red' }), __meo$i: '' } as never))).toMatchObject({ color: 'red' })
  })

  it('never hands the marker to the element', () => {
    const element = renderedChild(() => markedRow(ROW_FINGERPRINT))
    for (const key of Object.keys(element.props)) expect(key.startsWith('__meo$')).toBe(false)
  })
})

describe('an unmarked call site', () => {
  it('merges the factory’s initial props as before', () => {
    const node = Row({ ...named(ROW_STYLE), children: 'x' } as never)
    expect(runtimeCss(node)).toMatchObject(ROW_STYLE)
    expect(renderedChild(() => Row({ ...named(ROW_STYLE), children: 'x' } as never)).type).toBe(StyledRenderer)
  })
})
