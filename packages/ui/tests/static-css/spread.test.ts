// @vitest-environment jsdom
//
// A compiled call site with one spread, written by hand in the shape of the
// contract's slice 2: the static entries extracted into classes and kept as
// source in `__meo$b` (before the spread) and `__meo$a` (after it), every other
// key left in the literal where it was written.
//
// What the spread brings decides the path. With no CSS key, `css`, `as` or
// `theme` the element is plain, with the static classes. With any of them it
// renders exactly as the same call site uncompiled, so each such case is
// compared with that: the same markup and the same rules.
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Div, type NodeInstance } from '@src/main.js'
import StyledRenderer from '@src/components/styled-renderer.client.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PADDING = 'mn-0000000000p16'
const RED = 'mn-0000000000red'

const before = () => 'before'
const after = 'after'

/** `Div({ padding: 16, onClick: before, ...rest, color: 'red', title: after })`, compiled. */
const compiled = (rest: unknown) =>
  Div({
    __meo$: 2,
    __meo$s: `${PADDING} ${RED}`,
    __meo$b: { padding: 16 },
    __meo$a: { color: 'red' },
    'data-testid': 't',
    onClick: before,
    ...(rest as object),
    title: after,
  } as never)

/** The same call site, uncompiled. */
const uncompiled = (rest: unknown) => Div({ padding: 16, 'data-testid': 't', onClick: before, ...(rest as object), color: 'red', title: after } as never)

let roots: Root[] = []

function mount(node: NodeInstance): HTMLElement {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(node.render()))
  return container
}

/** Every rule in the document's sheets, Emotion's and the static ones. */
const rules = () => [...document.styleSheets].flatMap(sheet => [...sheet.cssRules].map(rule => rule.cssText))

/** The markup and the rules its classes select, for one render. */
function rendered(node: NodeInstance) {
  const element = mount(node).firstElementChild as HTMLElement
  const classes = [...element.classList]
  return { html: element.outerHTML, rules: rules().filter(rule => classes.some(name => rule.includes(`.${name}`))) }
}

beforeEach(() => {
  __resetStaticCss()
  registerStaticCss('spread', [
    [1, PADDING, `.${PADDING}{padding:16px;}`],
    [1, RED, `.${RED}{color:red;}`],
  ])
})
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  document.body.innerHTML = ''
})

describe('a spread that brings no CSS key', () => {
  it.each<[string, unknown]>([
    ['DOM keys', { id: 'x', 'aria-label': 'a' }],
    ['nothing', {}],
    ['undefined', undefined],
    ['null', null],
  ])('leaves the element plain, with the static classes: %s', (_, rest) => {
    const element = compiled(rest).render() as ReactElement<{ className?: string }>

    expect(element.type).toBe('div')
    expect(element.type).not.toBe(StyledRenderer)
    expect(element.props.className).toBe(`${PADDING} ${RED}`)
    for (const key of Object.keys(element.props)) expect(key.startsWith('__meo$')).toBe(false)
  })

  it('takes the static classes before a className it brings, and its style', () => {
    const element = compiled({ className: 'own', style: { color: 'green' } }).render() as ReactElement<{ className?: string; style?: unknown }>

    expect(element.props.className).toBe(`${PADDING} ${RED} own`)
    expect(element.props.style).toEqual({ color: 'green' })
  })

  it('drops the static classes when it brings disableEmotion, as the call site uncompiled drops its css', () => {
    const element = compiled({ disableEmotion: true }).render() as ReactElement<{ className?: string }>

    expect(element.type).toBe('div')
    expect(element.props.className).toBeUndefined()
  })

  it('passes its DOM keys through in the order they were written', () => {
    const element = compiled({ id: 'x', onClick: 'spread', title: 'spread' }).render() as ReactElement<Record<string, unknown>>

    expect(element.props.id).toBe('x')
    // Written before the spread, so the spread's wins; written after it, so the literal's wins.
    expect(element.props.onClick).toBe('spread')
    expect(element.props.title).toBe(after)
  })
})

describe('a spread that brings a CSS key, css, as or theme', () => {
  it.each<[string, unknown]>([
    ['the property written before it', { padding: 4 }],
    ['the property written after it', { color: 'blue' }],
    ['a longhand of the property before it', { paddingTop: 4 }],
    ['a longhand of the property after it', { paddingTop: 4, color: 'blue' }],
    ['another property', { margin: 2 }],
    ['css', { css: { margin: 3 } }],
    ['as', { as: 'section' }],
    // Present with no value: uncompiled, the spread still replaces the static padding.
    ['a CSS key whose value is undefined', { padding: undefined }],
    // Decides the runtime's default styles, as the call site uncompiled would.
    ['display', { display: 'flex' }],
    ['disableEmotion beside a CSS key', { disableEmotion: true, margin: 2 }],
    ['theme', { theme: { mode: 'light', system: { colors: { primary: 'green' } } } }],
    ['a getter', Object.defineProperty({}, 'padding', { enumerable: true, get: () => 5 })],
  ])('renders as the call site uncompiled: %s', (_, rest) => {
    const expected = rendered(uncompiled(rest))
    document.body.innerHTML = ''
    const actual = rendered(compiled(rest))

    expect(actual.html).toBe(expected.html)
    expect(actual.rules).toEqual(expected.rules)
    expect(actual.html).not.toContain('mn-')
  })

  it('gives the spread’s value for a property written before it', () => {
    const { rules: applied } = rendered(compiled({ padding: 4 }))
    expect(applied.join(' ')).toMatch(/padding: 4px/)
    expect(applied.join(' ')).not.toMatch(/padding: 16px/)
  })

  it('gives the literal’s value for a property written after it', () => {
    const { rules: applied } = rendered(compiled({ color: 'blue' }))
    expect(applied.join(' ')).toMatch(/color: red/)
    expect(applied.join(' ')).not.toMatch(/color: blue/)
  })
})

describe('a spread of a string', () => {
  it('renders as the call site uncompiled', () => {
    const expected = rendered(uncompiled('ab'))
    document.body.innerHTML = ''
    expect(rendered(compiled('ab')).html).toBe(expected.html.replace(/ class="[^"]*"/, ` class="${PADDING} ${RED}"`))
  })
})
