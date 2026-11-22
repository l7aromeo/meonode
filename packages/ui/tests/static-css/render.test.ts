// @vitest-environment jsdom
//
// What a node the compiler extracted styles from renders in the browser. Each
// node here is compiled output written by hand in the contract's shape: the
// static classes in `__meo$s`, the variables their rules read in `__meo$v`, and
// whatever css stays on the runtime path in `__meo$c`.
import { act, createElement, isValidElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Div, Img, Span, ThemeProvider, type NodeInstance, type Theme } from '@src/main.js'
import StyledRenderer from '@src/components/styled-renderer.client.js'
import { StaticStyles } from '@src/components/static-styles.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { asThemeProps } from '../_theme-props.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RED = 'mn-000000000000r'
const WIDE = 'mn-000000000000w'
const HOVER = 'mn-000000000000h'

/** The module a compiled file registers at its top level. */
function registerModule() {
  registerStaticCss('module-a', [
    [1, RED, `.${RED}{color:red;}`],
    [1, WIDE, `.${WIDE}{width:var(--mv-000000000000w);}`],
    [2, HOVER, `.${HOVER}:hover{color:blue;}`],
  ])
}

/** A compiled host call site: `Div({ color: 'red', width, '&:hover': {...}, ...rest })`. */
const compiled = (rest: Record<string, unknown> = {}) =>
  Div({ __meo$: 2, __meo$s: `${RED} ${WIDE} ${HOVER}`, __meo$v: { '--mv-000000000000w': '8px' }, ...rest } as never)

let container: HTMLElement
let root: Root | undefined

function mount(node: NodeInstance | ReactElement): HTMLElement {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(isValidElement(node) ? node : node.render()))
  return container
}

const emotionRules = () =>
  [...document.head.querySelectorAll<HTMLStyleElement>('style[data-emotion]')].flatMap(element =>
    [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText),
  )

beforeEach(() => {
  __resetStaticCss()
  registerModule()
})
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  container?.remove()
})

describe('a node whose styles were all extracted', () => {
  it('renders a plain host element with the static classes and variables', () => {
    const el = mount(compiled({ children: 'x' })).firstElementChild as HTMLElement

    expect(el.outerHTML).toBe(`<div class="${RED} ${WIDE} ${HOVER}" style="--mv-000000000000w: 8px;">x</div>`)
  })

  it('takes no StyledRenderer, no theme hook and no default styles', () => {
    const element = compiled({ children: 'x' }).render()

    expect(element.type).toBe('div')
    expect(element.type).not.toBe(StyledRenderer)
    mount(element)
    expect(emotionRules().some(rule => rule.includes('flex-shrink'))).toBe(false)
  })

  it('puts the static classes before the element’s own className', () => {
    const fromDom = mount(compiled({ __meo$d: { className: 'own' } })).firstElementChild as HTMLElement
    expect(fromDom.className).toBe(`${RED} ${WIDE} ${HOVER} own`)
  })

  it('takes a className passed outside the compiled buckets the same way', () => {
    const el = mount(compiled({ className: 'own' })).firstElementChild as HTMLElement
    expect(el.className).toBe(`${RED} ${WIDE} ${HOVER} own`)
  })

  it('lets the element’s own style win over a variable', () => {
    const el = mount(compiled({ __meo$d: { style: { color: 'green', '--mv-000000000000w': '1px' } } })).firstElementChild as HTMLElement

    expect(el.getAttribute('style')).toBe('--mv-000000000000w: 1px; color: green;')
  })

  it('leaves a variable out when its value is nothing', () => {
    const el = mount(compiled({ __meo$v: { '--mv-000000000000w': undefined } })).firstElementChild as HTMLElement
    expect(el.style.getPropertyValue('--mv-000000000000w')).toBe('')
  })

  it('carries the server’s static styles as one slot after its own children, which renders nothing here', () => {
    const element = Div({ children: [compiled({ key: 'a' }), Span('y')] }).render() as ReactElement<{ children: unknown[] }>
    const children = element.props.children
    const slot = children[children.length - 1] as ReactElement[]

    expect(Array.isArray(slot)).toBe(true)
    expect(slot.map(child => child.type)).toEqual([StaticStyles])
    expect(mount(element).innerHTML).toBe(`<div><div class="${RED} ${WIDE} ${HOVER}" style="--mv-000000000000w: 8px;"></div><span>y</span></div>`)
    // The browser's rules are the registry's own sheets; React is handed none.
    expect(document.head.querySelectorAll('style[data-precedence]')).toHaveLength(0)
  })

  it('renders beside a root that cannot carry the slot', () => {
    const element = Img({ __meo$: 2, __meo$s: RED, alt: '' } as never).render() as ReactElement<{ children: unknown[] }>

    expect(element.type).not.toBe('img')
    expect(mount(element).innerHTML).toBe(`<img alt="" class="${RED}">`)
  })
})

describe('a node with css left on the runtime path', () => {
  const partial = () => compiled({ __meo$c: { padding: 4 }, children: 'x' })

  it('renders through StyledRenderer, with the static classes before Emotion’s', () => {
    const element = partial().render() as ReactElement<{ className?: string }>
    expect(element.type).toBe(StyledRenderer)

    const el = mount(element).firstElementChild as HTMLElement
    const classes = el.className.split(' ')
    expect(classes.slice(0, 3)).toEqual([RED, WIDE, HOVER])
    expect(classes).toHaveLength(4)
    expect(classes[3]).toMatch(/^css-/)
    expect(el.style.getPropertyValue('--mv-000000000000w')).toBe('8px')
  })

  it('keeps the runtime’s defaults on what stays on the runtime path', () => {
    mount(partial())
    expect(emotionRules().some(rule => /flex-shrink: 0/.test(rule) && /padding: 4px/.test(rule))).toBe(true)
  })

  it('has its static rules in sheets before Emotion’s', () => {
    mount(partial())
    const order = [...document.head.querySelectorAll('style')].map(element => (element.hasAttribute('data-emotion') ? 'emotion' : 'static'))

    expect(order.indexOf('emotion')).toBeGreaterThan(order.lastIndexOf('static'))
  })
})

describe('compiled output rendered as an element under another node', () => {
  const theme: Theme = { mode: 'light', system: { colors: { primary: 'red' } } }

  it.each<[string, (child: ReactElement) => NodeInstance]>([
    ['a node', child => Div({ children: child })],
    ['a ThemeProvider', child => ThemeProvider({ ...asThemeProps(theme), children: child })],
    ['a node inside a ThemeProvider', child => ThemeProvider({ ...asThemeProps(theme), children: Div({ children: [child] }) })],
  ])('is copied as written under %s', (_, parent) => {
    const child = compiled({ __meo$d: { className: 'own' }, children: 'x' }).render()
    const html = mount(parent(child)).innerHTML

    expect(html).toContain(`<div class="${RED} ${WIDE} ${HOVER} own" style="--mv-000000000000w: 8px;">x</div>`)
    // Nothing was compiled for it on the way.
    expect(emotionRules().some(rule => rule.includes('color: red'))).toBe(false)
  })
})

describe('a node with Emotion disabled', () => {
  it('takes no static classes or variables under an ancestor that disabled it', () => {
    const html = mount(Div({ disableEmotion: true, children: [compiled({ key: 'c', __meo$d: { className: 'own' }, children: 'x' })] })).innerHTML

    expect(html).toBe('<div><div class="own">x</div></div>')
  })

  it('takes none when it disabled Emotion itself', () => {
    const el = mount(compiled({ disableEmotion: true, children: 'x' })).firstElementChild as HTMLElement
    expect(el.outerHTML).toBe('<div>x</div>')
  })
})

describe('a node with markers before any module registered', () => {
  it('still takes its classes, and carries no slot', () => {
    __resetStaticCss()
    const element = compiled({ children: 'x' }).render() as ReactElement<{ children: unknown }>

    expect(element.props.children).toBe('x')
    expect((mount(element).firstElementChild as HTMLElement).className).toBe(`${RED} ${WIDE} ${HOVER}`)
  })
})

describe('the markers', () => {
  it('never reach the element', () => {
    const element = compiled({ __meo$c: { padding: 4 } }).render() as ReactElement<Record<string, unknown>>
    for (const key of Object.keys(element.props)) expect(key.startsWith('__meo$')).toBe(false)
    const plain = compiled().render() as ReactElement<Record<string, unknown>>
    for (const key of Object.keys(plain.props)) expect(key.startsWith('__meo$')).toBe(false)
  })

  it('are ignored by schema 1, which never had them', () => {
    const element = Div({ __meo$: 1, __meo$s: RED, children: 'x' } as never).render() as ReactElement<Record<string, unknown>>

    expect(element.props.className).toBeUndefined()
    expect(createElement('div').type).toBe('div')
  })
})
