// @vitest-environment jsdom
//
// A compiled call site of a layout factory (`Row`, `Column`, …) whose initial
// props the compiler merged itself. It marks the call site with a fingerprint of
// what it merged, `__meo$i`, and the factory then uses the props as given rather
// than merging its initial props in again, which would bring them back as
// runtime css and keep the element from being plain. A call site the compiler
// did not merge, or merged against other initial props, merges as before.
import { type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { Center, Column, createChildrenFirstNode, createNode, Row } from '@src/main.js'
import StyledRenderer from '@src/components/styled-renderer.client.js'
import { initialPropsFingerprint } from '@src/core.node.js'

const FLEX = 'mn-00000000000fx'
const ROW = 'mn-00000000000rw'

/** `Row({ children: 'x' })` with both initial entries extracted. */
const markedRow = (fingerprint: unknown, rest: Record<string, unknown> = {}) =>
  Row({ __meo$: 2, __meo$s: `${FLEX} ${ROW}`, __meo$i: fingerprint, children: 'x', ...rest } as never).render() as ReactElement<Record<string, unknown>>

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
    const element = markedRow('display:flex;flexDirection:row;')

    expect(element.type).toBe('div')
    expect(element.type).not.toBe(StyledRenderer)
    expect(element.props.className).toBe(`${FLEX} ${ROW}`)
  })

  it('merges as before when the fingerprint is another factory’s', () => {
    const element = markedRow('display:flex;flexDirection:column;')
    expect(element.type).toBe(StyledRenderer)
  })

  it('merges as before when the marker is not a string', () => {
    expect(markedRow(1).type).toBe(StyledRenderer)
  })

  it('works for every built-in layout factory with its own fingerprint', () => {
    for (const [factory, fingerprint] of [
      [Column, 'display:flex;flexDirection:column;'],
      [Center, 'alignItems:center;display:flex;flexDirection:column;justifyContent:center;'],
    ] as const) {
      const element = factory({ __meo$: 2, __meo$s: FLEX, __meo$i: fingerprint } as never).render() as ReactElement
      expect(element.type).toBe('div')
    }
  })

  it('keeps its own css as written, with nothing of the factory composed in', () => {
    const custom = createNode('div', { display: 'flex' })
    const marked = custom({ __meo$: 2, __meo$s: FLEX, __meo$i: 'display:flex;', css: { color: 'red' } } as never).render() as ReactElement<{ css?: unknown }>
    const unmarked = custom({ __meo$: 2, __meo$s: FLEX, css: { color: 'red' } } as never).render() as ReactElement<{ css?: unknown }>

    expect(marked.props.css).toEqual({ color: 'red' })
    expect(unmarked.props.css).toEqual({ display: 'flex', color: 'red' })
  })

  it('works for a children-first factory too', () => {
    const P = createChildrenFirstNode('p', { display: 'flex' })
    const element = P('x', { __meo$: 2, __meo$s: FLEX, __meo$i: 'display:flex;' } as never).render() as ReactElement<{ children?: unknown }>

    expect(element.type).toBe('p')
    expect(element.props.children).toBe('x')
  })

  it('merges as before for a factory with no fingerprint', () => {
    const custom = createNode('div', { css: { color: 'red' } })
    const element = custom({ __meo$: 2, __meo$s: FLEX, __meo$i: '' } as never).render() as ReactElement
    expect(element.type).toBe(StyledRenderer)
  })

  it('never hands the marker to the element', () => {
    const element = markedRow('display:flex;flexDirection:row;')
    for (const key of Object.keys(element.props)) expect(key.startsWith('__meo$')).toBe(false)
  })
})

describe('an unmarked call site', () => {
  it('merges the factory’s initial props as before', () => {
    const element = Row({ __meo$: 2, __meo$s: `${FLEX} ${ROW}`, children: 'x' } as never).render() as ReactElement<{ css?: Record<string, unknown> }>

    expect(element.type).toBe(StyledRenderer)
    expect(element.props.css).toMatchObject({ display: 'flex', flexDirection: 'row' })
  })
})
