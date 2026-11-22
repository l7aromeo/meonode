// @vitest-environment node
//
// A call that sets a DOM prop to `undefined` removes a factory's default for it,
// as for any other prop. Compiled by `@meonode/compiler`, the call's DOM props
// move into its `__meo$d` bucket while the factory's defaults stay at the top
// level, and the bucket's entries win over the top level, an explicit
// `undefined` included. Each compiled call here is the shape the compiler emits
// for a call of a factory in `factoryModules`, built by hand, against the same
// call uncompiled. The uncompiled calls take their props from variables, so
// `test:compiled` leaves them as written.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createChildrenFirstNode, createNode, type NodeInstance } from '@src/main.js'

type Props = Record<string, unknown>

const onClick = () => {}

/** A default for each kind of DOM prop a factory may set. */
const DEFAULTS: Props = {
  className: 'a',
  id: 'main',
  title: 'title',
  role: 'region',
  tabIndex: 0,
  hidden: true,
  'aria-label': 'label',
  'data-kind': 'kind',
  style: { color: 'red' },
  onClick,
}

/** The element `node` renders, and its own props, without children. */
function rendered(node: NodeInstance): { html: string; props: Props } {
  const element = node.render() as { props: Props }
  const { children: _children, ...props } = element.props
  return { html: renderToStaticMarkup(element as never), props }
}

describe.each(Object.keys(DEFAULTS))('a call setting a factory’s `%s` default to undefined', prop => {
  const defaults = { [prop]: DEFAULTS[prop] }
  const removed = { [prop]: undefined }

  it('removes it compiled, as uncompiled (createNode)', () => {
    const Box = createNode('div', defaults as never) as unknown as (props?: Props) => NodeInstance
    const uncompiled = rendered(Box({ ...removed, children: 'text' }))
    expect(uncompiled.props).not.toHaveProperty(prop)
    expect(rendered(Box({ __meo$: 2, __meo$d: removed, children: 'text' }))).toEqual(uncompiled)
  })

  it('removes it compiled, as uncompiled (createChildrenFirstNode)', () => {
    const Text = createChildrenFirstNode('p', defaults as never) as unknown as (children?: unknown, props?: Props) => NodeInstance
    const uncompiled = rendered(Text('text', removed))
    expect(uncompiled.props).not.toHaveProperty(prop)
    expect(rendered(Text('text', { __meo$: 2, __meo$d: removed }))).toEqual(uncompiled)
  })
})

describe('a compiled DOM bucket', () => {
  it('removes a value the call spread at the top level, as uncompiled', () => {
    const Box = createNode('div') as unknown as (props?: Props) => NodeInstance
    const spread = { id: 'spread', title: 'kept' }
    const uncompiled = rendered(Box({ ...spread, id: undefined, children: 'x' }))
    expect(rendered(Box({ __meo$: 2, ...spread, __meo$d: { id: undefined }, children: 'x' }))).toEqual(uncompiled)
    expect(uncompiled.html).toBe('<div title="kept">x</div>')
  })

  it('sets a value over a factory’s default, and leaves the defaults it does not name', () => {
    const Box = createNode('div', { className: 'a', id: 'main' } as never) as unknown as (props?: Props) => NodeInstance
    const call = { className: 'b' }
    const uncompiled = rendered(Box({ ...call, children: 'x' }))
    expect(rendered(Box({ __meo$: 2, __meo$d: call, children: 'x' }))).toEqual(uncompiled)
    expect(uncompiled.html).toBe('<div class="b" id="main">x</div>')
  })

  it('with an undefined value and no default leaves nothing, as uncompiled', () => {
    const Box = createNode('div') as unknown as (props?: Props) => NodeInstance
    const call = { id: undefined }
    expect(rendered(Box({ __meo$: 2, __meo$d: call, children: 'x' }))).toEqual(rendered(Box({ ...call, children: 'x' })))
  })

  it('removes a default beside a style bucket, as uncompiled', () => {
    const Box = createNode('div', { className: 'a', padding: 4 } as never) as unknown as (props?: Props) => NodeInstance
    const call = { className: undefined, margin: 2 }
    const uncompiled = rendered(Box({ ...call, children: 'x' }))
    const compiled = rendered(Box({ __meo$: 2, __meo$c: { margin: 2 }, __meo$d: { className: undefined }, children: 'x' }))
    expect(compiled.html).toBe(uncompiled.html)
    expect(compiled.html).not.toContain('class="a')
  })
})
