// @vitest-environment jsdom
//
// A compiled call site styles its node as the same call site does uncompiled.
// Uncompiled, `NodeUtil.processProps` writes a node's flat style props with
// primitive values (strings, numbers, booleans) first and every other value
// (objects, arrays, null, undefined, theme functions) after them, each group in
// the props' own order. The compiler hands the same props over in `__meo$c`, in
// source order, and the runtime must write them in the uncompiled order.
//
// Cases are generated from that rule: every ordered pair of value kinds, on two
// keys that write the same property, in both key orders: both keys at the call
// site of a plain host factory and of a layout factory, and the first key in a
// factory's initial props, which reach the runtime beside the compiler's bucket
// rather than in it.
import { cleanup, render } from '@testing-library/react'
import { createNode, Div, Row, ThemeProvider } from '@src/main.js'
import { COMPILED_MARKER, COMPILER_SCHEMA_KEYS } from '@src/constant/common.const.js'
import { NodeUtil } from '@src/util/node.util.js'

const SK = COMPILER_SCHEMA_KEYS[2]

afterEach(cleanup)

/** One value of each kind the runtime's ordering tells apart, for a margin key. */
const KINDS: Record<string, (key: string) => unknown> = {
  string: key => (key === 'margin' ? '1px' : '6px'),
  number: key => (key === 'margin' ? 3 : 8),
  boolean: () => true,
  null: () => null,
  undefined: () => undefined,
  array: key => (key === 'margin' ? ['1px', '2px'] : ['5px', '7px']),
  object: () => ({ color: 'red' }),
  function: key => () => (key === 'margin' ? '4px' : '9px'),
}

/** Kinds the runtime writes first. */
const PRIMITIVE_KINDS = new Set(['string', 'number', 'boolean'])

/** The `margin-top` a key of each kind writes, or `undefined` for none. */
const MARGIN_TOP: Record<string, Record<string, string | undefined>> = {
  margin: { string: '1px', number: '3px', array: '2px', function: '4px' },
  marginTop: { string: '6px', number: '8px', array: '7px', function: '9px' },
}

/** The computed `margin-top` of an element no declaration sets it on. */
const INITIAL_MARGIN_TOP = '0px'

/** Two keys that write `margin-top`, so their order decides its value. */
const KEY_ORDERS = [
  ['margin', 'marginTop'],
  ['marginTop', 'margin'],
] as const

/** Where the two keys are written. */
const PLACES = ['Div', 'Row', 'initial'] as const

interface OrderCase {
  name: string
  /** The computed `margin-top` the ordering rule gives: the last of the keys that write one. */
  marginTop: string
  /** The two keys in the order the rule writes them. */
  order: string[]
  place: (typeof PLACES)[number]
  /** The factory's initial props. */
  initial: Record<string, unknown>
  /** The call site's style props. */
  css: Record<string, unknown>
}

function cases(): OrderCase[] {
  const out: OrderCase[] = []
  for (const place of PLACES) {
    for (const [first, second] of KEY_ORDERS) {
      for (const [firstKind, firstValue] of Object.entries(KINDS)) {
        for (const [secondKind, secondValue] of Object.entries(KINDS)) {
          const both = { [first]: firstValue(first), [second]: secondValue(second) }
          const written = [
            [first, firstKind],
            [second, secondKind],
          ].sort(([, a], [, b]) => Number(PRIMITIVE_KINDS.has(b)) - Number(PRIMITIVE_KINDS.has(a)))
          const winner = written.map(([key, kind]) => MARGIN_TOP[key][kind]).filter(Boolean)
          out.push({
            marginTop: winner.at(-1) ?? INITIAL_MARGIN_TOP,
            order: written.map(([key]) => key),
            name: `${place} ${first}: ${firstKind}, ${second}: ${secondKind}`,
            place,
            initial: place === 'initial' ? { [first]: both[first] } : {},
            css: place === 'initial' ? { [second]: both[second] } : both,
          })
        }
      }
    }
  }
  return out
}

/** The factory a case calls. */
function factoryOf({ place, initial }: OrderCase) {
  if (place === 'Row') return Row
  if (place === 'initial') return createNode('div', initial as never)
  return Div
}

/** Renders `node` under a theme, so theme functions resolve. */
function mount(node: { render(): unknown }) {
  return render(ThemeProvider({ tokens: { primary: 'rgb(1, 2, 3)' }, modes: ['light'], defaultMode: 'light', children: node } as never).render() as never)
}

/** The node's own Emotion class, its rule's text and its computed `margin-top`. */
function styleOf(id: string) {
  const el = document.getElementById(id) as HTMLElement
  const cls = [...el.classList].find(c => c.startsWith('css-')) ?? ''
  const rule = [...document.querySelectorAll('style')].map(s => s.textContent ?? '').find(text => text.startsWith(`.${cls}{`)) ?? ''
  return { cls, rule, marginTop: getComputedStyle(el).marginTop }
}

describe('compiled call sites keep the uncompiled style order', () => {
  const all = cases()

  it.each(all)('$name', c => {
    const make = factoryOf(c)
    const css = c.css
    mount(make({ id: 'uncompiled', ...css } as never))
    // The shape every compiler release since 0.2.0 emits: the style props in
    // source order in the css bucket, the rest in the DOM bucket.
    mount(make({ [COMPILED_MARKER]: 2, [SK.css]: { ...css }, [SK.dom]: { id: 'compiled' } } as never))

    const compiled = styleOf('compiled')
    // A node with no rule would compare equal to one with none on the other side.
    expect(compiled.rule).not.toBe('')
    expect(compiled).toEqual(styleOf('uncompiled'))
    expect(compiled.marginTop).toBe(c.marginTop)
  })

  // Values that write nothing (`undefined`, booleans, `null` once stylis drops its
  // empty block) still name the class through the text they hash into, so the
  // order of the props the runtime hands Emotion is checked as well.
  it.each(all.filter(c => c.place !== 'Row'))('$name: key order', c => {
    const keysOf = (props: Record<string, unknown>) => Object.keys(NodeUtil.processProps(props as never).css as Record<string, unknown>)
    const uncompiled = keysOf({ ...c.initial, ...c.css })
    const compiled = keysOf({ ...c.initial, [COMPILED_MARKER]: 2, [SK.css]: { ...c.css } })
    expect(uncompiled).toEqual(c.order)
    expect(compiled).toEqual(c.order)
  })

  // Written out, so `test:compiled` runs it through the compiler itself.
  it('gives the issue call site the uncompiled margin-top', () => {
    // A fallback list is not in the property's type; the runtime takes it.
    mount(Div({ id: 'written', margin: ['1px', '2px'] as never, marginTop: 8 }))
    expect(styleOf('written').marginTop).toBe('2px')
  })

  it('covers every kind pair', () => {
    const kinds = Object.keys(KINDS).length
    expect(all).toHaveLength(PLACES.length * KEY_ORDERS.length * kinds * kinds)
    // A case where order decides the value exists: a primitive after an array.
    expect(all.some(c => c.name === 'Div margin: array, marginTop: number')).toBe(true)
  })
})
