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
  it('is its entries as key:value pairs, keys in code-unit order', () => {
    expect(initialPropsFingerprint({ display: 'flex', flexDirection: 'row' })).toBe('display:flex;flexDirection:row;')
    expect(initialPropsFingerprint({ justifyContent: 'center', alignItems: 'center', display: 'flex', flexDirection: 'column' })).toBe(
      'alignItems:center;display:flex;flexDirection:column;justifyContent:center;',
    )
  })

  it('writes a number as JavaScript does', () => {
    expect(initialPropsFingerprint({ flexGrow: 1, opacity: 0.5, zIndex: -2 })).toBe('flexGrow:1;opacity:0.5;zIndex:-2;')
  })

  it('is none when a value is not a string or number, or a key or value holds ; or :', () => {
    expect(initialPropsFingerprint({ css: { color: 'red' } })).toBeUndefined()
    expect(initialPropsFingerprint({ display: true })).toBeUndefined()
    expect(initialPropsFingerprint({ fontFamily: 'a;b' })).toBeUndefined()
    expect(initialPropsFingerprint({ content: 'a:b' })).toBeUndefined()
    expect(initialPropsFingerprint(undefined)).toBeUndefined()
  })
})

describe('a marked call site', () => {
  it('uses its props as given when the fingerprint is the factory’s, and renders plain', () => {
    expect(runtimeCss(markedRow('display:flex;flexDirection:row;'))).toEqual({})
    const element = renderedChild(() => markedRow('display:flex;flexDirection:row;'))
    expect(element.type).toBe('div')
    expect(element.props.className).toMatch(/^css-/)
  })

  it('merges as before when the fingerprint is another factory’s', () => {
    expect(runtimeCss(markedRow('display:flex;flexDirection:column;'))).toMatchObject(ROW_STYLE)
    expect(renderedChild(() => markedRow('display:flex;flexDirection:column;')).type).toBe(StyledRenderer)
  })

  it('merges as before when the marker is not a string', () => {
    expect(runtimeCss(markedRow(1))).toMatchObject(ROW_STYLE)
  })

  it('works for every built-in layout factory with its own fingerprint', () => {
    for (const [factory, initial, fingerprint] of [
      [Column, { display: 'flex', flexDirection: 'column' }, 'display:flex;flexDirection:column;'],
      [
        Center,
        { alignItems: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' },
        'alignItems:center;display:flex;flexDirection:column;justifyContent:center;',
      ],
    ] as const) {
      expect(runtimeCss(factory({ ...named(initial), __meo$i: fingerprint } as never))).toEqual({})
      expect(renderedChild(() => factory({ ...named(initial), __meo$i: fingerprint } as never)).type).toBe('div')
    }
  })

  it('keeps its own css as written, with nothing of the factory composed in', () => {
    const custom = createNode('div', { display: 'flex' })
    // Props as a value, not a literal, so a compiled run of this suite leaves the call sites as they are.
    const markedProps = { ...named({ display: 'flex' }), __meo$i: 'display:flex;', css: { color: 'red' } }
    const unmarkedProps = { ...named({ display: 'flex' }), css: { color: 'red' } }
    const marked = custom(markedProps as never)
    const unmarked = custom(unmarkedProps as never)

    expect(runtimeCss(marked)).toEqual({ color: 'red' })
    expect(runtimeCss(unmarked)).toEqual({ display: 'flex', color: 'red' })
  })

  it('works for a children-first factory too', () => {
    const P = createChildrenFirstNode('p', { display: 'flex' })
    const props = { ...named({ display: 'flex' }), __meo$i: 'display:flex;' }
    const element = renderedChild(() => P('x', props as never))

    expect(element.type).toBe('p')
    expect(element.props.children).toBe('x')
  })

  it('merges as before for a factory with no fingerprint', () => {
    const custom = createNode('div', { css: { color: 'red' } })
    expect(runtimeCss(custom({ ...named({ color: 'red' }), __meo$i: '' } as never))).toMatchObject({ color: 'red' })
  })

  it('never hands the marker to the element', () => {
    const element = renderedChild(() => markedRow('display:flex;flexDirection:row;'))
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
