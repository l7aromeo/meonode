// @vitest-environment jsdom
//
// A call of a factory imported from another module, which the compiler can't
// merge with the factory's initial props: it emits `__meoFactoryCall(Panel,
// site, ...args)` with the arguments as written, and a module-level `site`
// naming the argument it found the call's props in. The runtime joins the
// call's style with the factory's initial props at the site's first call and
// renders a named node under that style from then on, or calls the factory as
// written. Either way the page is the uncompiled call's. Props are passed as
// variables, so a compiled run of this suite leaves the uncompiled twins as
// they are.
import { act, createElement, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __meoFactoryCall, Button, createChildrenFirstNode, createNode, Div, Node, type FactoryCallSite, type NodeInstance } from '@src/main.js'
import { STATIC_CARRIER_MARKER, STATIC_NAME_MARKER } from '@src/constant/common.const.js'
import { __resetStaticCss, hasNamedStyles, registerStaticCss, staticStylesOf } from '@src/util/static-css.util.js'
import { FACTORY_JOIN } from '@src/core.node.js'
import { __meoFactoryCall as leafFactoryCall, factoryShapes } from '@src/factory-call/index.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Props = Record<string, unknown>

const RED = 'rgb(200, 0, 0)'
const BLUE = 'rgb(0, 0, 200)'
/** The runtime sibling's css, a variable so a compiled run with extraction on names nothing in this suite. */
const SIBLING_CSS = { order: 1 }

/** A factory with flat and nested default styles and default DOM props. */
const Panel = createNode('section', {
  padding: 8,
  css: { color: RED, '&:hover': { color: BLUE } },
  className: 'panel',
  title: 'panel',
} as never) as unknown as (props?: Props, deps?: unknown[]) => NodeInstance
/** A children-first factory. */
const Label = createChildrenFirstNode('span', { fontWeight: 700 } as never) as unknown as (children?: unknown, props?: Props, deps?: unknown[]) => NodeInstance
/** A factory that styles nothing. */
const Bare = createNode('div') as unknown as (props?: Props) => NodeInstance

/** `__meoFactoryCall` with the types the tests call it with. */
const call = __meoFactoryCall as (callee: unknown, site: FactoryCallSite, ...args: unknown[]) => NodeInstance

/** Whether a node renders named, under the name the join gave it. */
const nameOf = (node: NodeInstance): string | undefined => (node.props as Props)[STATIC_NAME_MARKER] as string | undefined

let roots: Root[] = []

/** Mounts `tree` rendered from a component, after a runtime sibling, and gives its markup and its first styled element's computed style. */
function mount(tree: () => NodeInstance): { html: string; style: { color: string; padding: string; fontWeight: string } } {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  roots.push(root)
  act(() =>
    root.render(
      createElement(function Page() {
        return Div({ children: [Div({ key: 'r', css: SIBLING_CSS }), tree()] }).render() as ReactElement
      }),
    ),
  )
  const element = container.firstElementChild!.children[1] as HTMLElement
  const computed = getComputedStyle(element)
  return { html: container.innerHTML, style: { color: computed.color, padding: computed.padding, fontWeight: computed.fontWeight } }
}

beforeEach(() => {
  __resetStaticCss()
})
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('a callee no createNode made', () => {
  it('is called as written: its arguments, their count, `this` and what it returns', () => {
    let seen: { self: unknown; args: unknown[] } | undefined
    const plain = function (this: unknown, ...args: unknown[]) {
      seen = { self: this, args }
      return 'returned'
    }
    const second = { a: 1 }
    expect(call(plain, { at: 0 }, { b: 2 }, second, 3)).toBe('returned')
    expect(seen).toEqual({ self: undefined, args: [{ b: 2 }, second, 3] })
    expect(seen!.args[1]).toBe(second)
    call(plain, { at: 1 })
    expect(seen!.args).toEqual([])
  })

  it('throws as the call would, when it is not a function', () => {
    expect(() => call(undefined, { at: 0 }, {})).toThrow(TypeError)
  })
})

describe('a factory and the join of the copy of core that made it', () => {
  it('is called as written when that copy’s join is not loaded, though this one’s is', () => {
    const element = { type: 'section' }
    const made = vi.fn((props?: Props) => ({ element, props }))
    factoryShapes.set(made, { element: 'section', initialProps: { padding: 8 }, propsAt: 0, core: {} })
    call(Panel, { at: 0 }, { color: BLUE })
    expect(FACTORY_JOIN.join).toBeTypeOf('function')
    const props = { color: BLUE }
    expect(call(made, { at: 0 }, props)).toEqual({ element, props })
    expect(made).toHaveBeenCalledWith(props)
  })

  it('joins through the light entry once its core’s join is loaded, and is called as written before', () => {
    const site: FactoryCallSite = { at: 0 }
    const loaded = FACTORY_JOIN.join
    FACTORY_JOIN.join = undefined
    try {
      expect(nameOf(leafFactoryCall(Panel, site, { color: BLUE }) as NodeInstance)).toBeUndefined()
    } finally {
      FACTORY_JOIN.join = loaded
    }
    call(Bare, { at: 0 })
    expect(nameOf(leafFactoryCall(Panel, { at: 0 }, { color: BLUE }) as NodeInstance)).toBeDefined()
  })
})

describe('a createNode factory', () => {
  it('renders as the call uncompiled, as a named node', () => {
    const site = { at: 0 }
    const props = { padding: 4, id: 'p', children: 'x' }
    const joined = call(Panel, site, props)
    expect(nameOf(joined)).toMatch(/^[a-z0-9]+$/)
    expect(staticStylesOf(nameOf(joined)!)).toBeDefined()
    expect(mount(() => call(Panel, site, props))).toEqual(mount(() => Panel(props)))
    expect(mount(() => call(Panel, site, props)).style).toEqual({ color: RED, padding: '4px', fontWeight: '400' })
  })

  it('merges the call’s other props on every call, and keeps the site’s name', () => {
    const site = { at: 0 }
    const first = call(Panel, site, { padding: 4, id: 'a', children: 'a' })
    const second = call(Panel, site, { padding: 4, id: 'b', className: 'own', children: 'b' })
    expect(nameOf(second)).toBe(nameOf(first))
    expect(mount(() => call(Panel, site, { padding: 4, id: 'b', className: 'own', children: 'b' }))).toEqual(
      mount(() => Panel({ padding: 4, id: 'b', className: 'own', children: 'b' })),
    )
  })

  it('merges a nested `css` into the default’s, as the call uncompiled', () => {
    const site = { at: 0 }
    const props = { css: { '&:hover': { color: RED }, '&:focus': { color: BLUE } }, children: 'x' }
    expect(nameOf(call(Panel, site, props))).toBeDefined()
    expect(mount(() => call(Panel, site, props))).toEqual(mount(() => Panel(props)))
  })

  it('takes its default style alone for a call with no style of its own', () => {
    const site = { at: 0 }
    const props = { children: 'x' }
    expect(nameOf(call(Panel, site, props))).toBeDefined()
    expect(mount(() => call(Panel, site, props))).toEqual(mount(() => Panel(props)))
  })

  // The factory merges missing props as `{}`. The twins spread their arguments,
  // so a compiled run of this suite leaves them as written.
  it('joins a call with no arguments, or no props, as the call uncompiled', () => {
    const none: [] = []
    const site = { at: 0 }
    expect(nameOf(call(Panel, site))).toBeDefined()
    expect(mount(() => call(Panel, site))).toEqual(mount(() => Panel(...none)))
    const deps = [1]
    const unset: [undefined, number[]] = [undefined, deps]
    const node = call(Panel, { at: 0 }, ...unset)
    expect(nameOf(node)).toBeDefined()
    expect(node.dependencies).toEqual([1])
    expect(mount(() => call(Panel, { at: 0 }, ...unset))).toEqual(mount(() => Panel(...unset)))
  })

  it('passes `deps` on, as the call would', () => {
    const site = { at: 0 }
    const deps = [1]
    expect(call(Panel, site, { padding: 4 }, deps).dependencies).toBe(Panel({ padding: 4 }, deps).dependencies)
    expect(call(Panel, site, { padding: 4 }, deps).dependencies).toEqual([1])
  })

  it('joins again when the site calls another factory, as after a hot update of the factory’s module', () => {
    const site = { at: 0 }
    const props = { padding: 4, children: 'x' }
    const before = nameOf(call(Panel, site, props))
    const Updated = createNode('section', { padding: 8, css: { color: BLUE } } as never) as unknown as (props?: Props) => NodeInstance
    const after = call(Updated, site, props)
    expect(nameOf(after)).toBeDefined()
    expect(nameOf(after)).not.toBe(before)
    expect(mount(() => call(Updated, site, props))).toEqual(mount(() => Updated(props)))
  })

  it('is called as written when the site took its props from the second argument', () => {
    const node = call(Panel, { at: 1 }, { padding: 4, children: 'x' }, { padding: 5 })
    expect(nameOf(node)).toBeUndefined()
    expect(node.props).toEqual(Panel({ padding: 4, children: 'x' }, { padding: 5 } as never).props)
  })
})

describe('a joined call at a position whose first rule varies', () => {
  /** Holds a count, which a remount resets. */
  function Count() {
    const [count, setCount] = useState(0)
    return Div({ children: Button(`n:${count}`, { onClick: () => setCount(value => value + 1) }) }).render() as ReactElement
  }
  const PANEL_PROPS = { padding: 4 }

  /** The count after a click, then after the conditional runtime sibling before the call is taken away. */
  function countsAcrossToggle(make: (props: Props) => NodeInstance): [string, string] {
    const container = document.body.appendChild(document.createElement('div'))
    const root = createRoot(container)
    roots.push(root)
    let hide = () => {}
    function TogglePage() {
      const [on, setOn] = useState(true)
      hide = () => setOn(false)
      return Div({ children: [on && Div({ key: 'r', css: SIBLING_CSS }), make({ ...PANEL_PROPS, key: 'p', children: Node(Count) })] }).render() as ReactElement
    }
    act(() => root.render(createElement(TogglePage)))
    act(() => container.querySelector('button')!.click())
    const before = container.querySelector('button')!.textContent!
    act(() => hide())
    return [before, container.querySelector('button')!.textContent!]
  }

  it('keeps its state uncompiled, the call rendering through the styled renderer either way', () => {
    expect(countsAcrossToggle(props => Panel(props))).toEqual(['n:1', 'n:1'])
  })

  it('keeps its state as a carrier, where the site marks one', () => {
    const site = { at: 0, r: 1 as const }
    expect((call(Panel, site, PANEL_PROPS).props as Props)[STATIC_CARRIER_MARKER]).toBe(1)
    expect(countsAcrossToggle(props => call(Panel, site, props))).toEqual(['n:1', 'n:1'])
  })

  // What the mark is for: a named node with no rule before it renders as a
  // carrier, and with one renders its plain element, so its type changes.
  it('remounts where the site marks no carrier', () => {
    const site = { at: 0 }
    expect((call(Panel, site, PANEL_PROPS).props as Props)[STATIC_CARRIER_MARKER]).toBeUndefined()
    expect(countsAcrossToggle(props => call(Panel, site, props))).toEqual(['n:1', 'n:0'])
  })
})

describe('a children-first factory', () => {
  it('renders as the call uncompiled, its first argument the children', () => {
    const site = { at: 1 }
    const props = { color: BLUE, id: 'l' }
    expect(nameOf(call(Label, site, 'text', props))).toBeDefined()
    expect(mount(() => call(Label, site, 'text', props))).toEqual(mount(() => Label('text', props)))
    expect(mount(() => call(Label, site, 'text', props)).style).toEqual({ color: BLUE, padding: '0px', fontWeight: '700' })
    expect(call(Label, site, 'text', props, [2]).dependencies).toEqual([2])
  })

  // The compiler names argument 0 for a call with no arguments, whichever kind
  // of factory it calls. The twins spread their arguments, as above.
  it('joins a call with no arguments, or children and no props, as the call uncompiled', () => {
    const none: [] = []
    expect(nameOf(call(Label, { at: 0 }))).toBeDefined()
    expect(mount(() => call(Label, { at: 0 }))).toEqual(mount(() => Label(...none)))
    const childOnly: [string] = ['text']
    expect(nameOf(call(Label, { at: 1 }, ...childOnly))).toBeDefined()
    expect(mount(() => call(Label, { at: 1 }, ...childOnly))).toEqual(mount(() => Label(...childOnly)))
  })

  it('is called as written when the site took its props from the first argument', () => {
    const child = { padding: 4 }
    const props = { color: BLUE }
    const node = call(Label, { at: 0 }, child, props)
    expect(nameOf(node)).toBeUndefined()
    expect(node.props).toEqual(Label(child, props).props)
  })
})

describe('a call kept on the runtime path', () => {
  const Themed = createNode('div', { theme: { mode: 'light', system: {} }, padding: 1 } as never) as unknown as (props?: Props) => NodeInstance
  const Disabled = createNode('div', { disableEmotion: true, padding: 1 } as never) as unknown as (props?: Props) => NodeInstance

  it.each<[string, () => [unknown, unknown[]]]>([
    ['props that are not an object literal’s', () => [Panel, [Object.assign(Object.create({ inherited: 1 }), { padding: 4 })]]],
    ['a `theme` in the call', () => [Panel, [{ padding: 4, theme: { mode: 'light', system: {} } }]]],
    ['a `disableEmotion` in the call', () => [Panel, [{ padding: 4, disableEmotion: true }]]],
    ['a `theme` in the factory', () => [Themed, [{ padding: 4 }]]],
    ['a `disableEmotion` in the factory', () => [Disabled, [{ padding: 4 }]]],
    ['a function value', () => [Panel, [{ padding: () => 4 }]]],
    ['an array value', () => [Panel, [{ padding: [4, 5] }]]],
    ['an undefined value', () => [Panel, [{ padding: undefined }]]],
    ['a `css()`-like value', () => [Panel, [{ css: { name: 'x', styles: 'color:red;' } }]]],
    ['a `styles` key holding no string', () => [Panel, [{ css: { styles: { margin: 1 } } }]]],
    ['a nested `styles` key', () => [Panel, [{ css: { '&:focus': { styles: { margin: 1 } } } }]]],
    // A token in an at-rule's condition joins (factory-call-themed.test.ts); one in a selector does not.
    ['a selector holding a theme token', () => [Panel, [{ css: { '&[data-size="theme.sizes.md"]': { padding: 2 } } }]]],
    ['a style of nothing', () => [Bare, [{ id: 'b' }]]],
  ])('%s', (_, args) => {
    const [factory, callArgs] = args()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const site = { at: 0 }
    const node = call(factory, site, ...callArgs)
    expect(nameOf(node)).toBeUndefined()
    const plain = (factory as (...a: unknown[]) => NodeInstance)(...callArgs)
    expect(node.props).toEqual(plain.props)
    // Decided once for the site: a later call is called as written too.
    expect(nameOf(call(factory, site, ...callArgs))).toBeUndefined()
    error.mockRestore()
    warn.mockRestore()
  })

  it('a style whose name another text holds', () => {
    const props = { padding: 6 }
    const name = nameOf(call(Panel, { at: 0 }, props))!
    __resetStaticCss()
    registerStaticCss('module-other', [[name, 'order:9;']])
    const node = call(Panel, { at: 0 }, props)
    expect(nameOf(node)).toBeUndefined()
    expect(staticStylesOf(name)).toBe('order:9;')
  })
})

describe('in development', () => {
  it('reports once, and calls as written, a call whose style is not its site’s first call’s', () => {
    const site = { at: 0 }
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(nameOf(call(Panel, site, { padding: 4 }))).toBeDefined()
    const varied = call(Panel, site, { padding: 5, children: 'x' })
    expect(nameOf(varied)).toBeUndefined()
    expect(varied.props).toEqual(Panel({ padding: 5, children: 'x' }).props)
    call(Panel, site, { padding: 6 })
    expect(error.mock.calls.map(args => String(args[0]))).toEqual([
      "[MeoNode] A call of the 'section' factory compiled as static has a style other than its first call's, so it renders on the runtime path. The compiler marked a call whose style varies.",
    ])
    // The site's own style still joins.
    expect(nameOf(call(Panel, site, { padding: 4 }))).toBeDefined()
  })

  // The compiler marks no list decision on a call it joins at run time, so the
  // call gets the check the call uncompiled gets, naming the line it is on.
  const panelSite = { at: 0 }
  const labelSite = { at: 1 }
  it.each([
    [
      'a createNode factory',
      (rows: unknown[]) => call(Panel, panelSite, { padding: 4, children: rows }),
      (rows: unknown[]) => {
        const props = { padding: 4, children: rows }
        return Panel(props)
      },
    ],
    [
      'a children-first factory',
      (rows: unknown[]) => call(Label, labelSite, rows, { color: RED }),
      (rows: unknown[]) => {
        const props = { color: RED }
        return Label(rows, props)
      },
    ],
  ])('reports an unkeyed list generated at a joined call of %s, as the call uncompiled', (_, joined, uncompiled) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reports = () => warn.mock.calls.filter(([message]) => String(message).startsWith('[MeoNode] A `children` list without keys'))
    const rows = (count: number) => Array.from({ length: count }, () => Div({ children: 'row' }))
    const evaluate = (build: (rows: unknown[]) => NodeInstance) => [2, 3].map(count => build(rows(count)))
    for (const node of evaluate(joined)) expect(nameOf(node)).toBeDefined()
    evaluate(uncompiled)
    expect(reports()).toHaveLength(2)
    for (const [, site] of reports())
      expect(
        String((site as Error).stack)
          .split('\n')
          .find(line => /^\s+at /.test(line)),
      ).toContain('factory-call.test.ts')
  })

  // A call the compiler marked (a `factoryModules` import's, with extraction
  // off's marks) decided its list already: neither side reports it.
  it('leaves the report to the marks of a joined call the compiler marked, as the call uncompiled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const site = { at: 0 }
    const props = (count: number) => ({ __meo$: 3, __meo$k: 'mk', padding: 4, children: Array.from({ length: count }, () => Div({ children: 'row' })) })
    for (const count of [2, 3]) expect(nameOf(call(Panel, site, props(count)))).toBeDefined()
    for (const count of [2, 3]) Panel(props(count))
    expect(warn.mock.calls.filter(([message]) => String(message).startsWith('[MeoNode] A `children` list without keys'))).toEqual([])
  })
})

describe('the registry', () => {
  it('holds the joined text again after it was cleared', () => {
    const site = { at: 0 }
    const props = { padding: 4, children: 'x' }
    const name = nameOf(call(Panel, site, props))!
    __resetStaticCss()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(mount(() => call(Panel, site, props))).toEqual(mount(() => Panel(props)))
    expect(staticStylesOf(name)).toBeDefined()
    expect(error).not.toHaveBeenCalled()
  })

  // A function child renders through a component of its own, so its walk
  // begins after the call in it registered its style: no walk can meet a
  // joined node built after it began, and no module registers anything ahead.
  it('renders as uncompiled a call made in a function child, with no other named styles (parity)', () => {
    expect(hasNamedStyles()).toBe(false)
    const site = { at: 0 }
    const props = { padding: 4, children: 'x' }
    const tree = (make: () => NodeInstance) => () => Div({ key: 'f', children: () => make() })
    expect(mount(tree(() => call(Panel, site, props)))).toEqual(mount(tree(() => Panel(props))))
  })
})
