// Host call sites with one top-level spread, static entries before and after
// it: a spread of DOM props (with keys also written before and after it), the
// same CSS property before and after a spread, a family member against its
// shorthand in both orders, spreads carrying css, as and theme, spreads of
// undefined, null and a string, a getter, and a prop-forwarding wrapper. Two
// spreads in one call stay on the runtime path in every slice. The nodes whose
// spread brings a CSS property, css, as or theme are marked data-parity-exact:
// they must render exactly as with extraction off, class names and rule text
// included.
import type { ReactElement } from 'react'
import { Div, Section, Span, Table, Tbody, Td, Tr } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.style-props', 'place.spread', 'place.as', 'value.string', 'env.ssr-hydrate'],
  routes: ['runtime:spread'],
  routing: [
    { node: 'dom', route: 'runtime:spread', runtime: ['padding', 'title', 'aria-label', 'color'], whole: true },
    { node: 'spread-wins', route: 'runtime:spread', runtime: ['color', 'padding'], whole: true },
    { node: 'literal-wins', route: 'runtime:spread', runtime: ['color', 'padding'], whole: true },
    { node: 'family-before', route: 'runtime:spread', runtime: ['padding'], whole: true },
    { node: 'family-after', route: 'runtime:spread', runtime: ['padding'], whole: true },
    { node: 'css', route: 'runtime:spread', runtime: ['margin'], whole: true },
    { node: 'as', route: 'runtime:spread', runtime: ['margin'], whole: true },
    { node: 'theme', route: 'runtime:spread', runtime: ['color'], whole: true },
    { node: 'undefined', route: 'runtime:spread', runtime: ['padding'], whole: true },
    { node: 'null', route: 'runtime:spread', runtime: ['padding'], whole: true },
    { node: 'string', route: 'runtime:spread', runtime: ['padding'], whole: true },
    { node: 'getter', route: 'runtime:spread', runtime: ['padding'], whole: true },
    { node: 'two', route: 'runtime:spread', runtime: ['padding'], whole: true },
    { node: 'class-style', route: 'runtime:spread', runtime: ['padding', 'color'], whole: true },
    { node: 'disable', route: 'runtime:spread', runtime: ['padding'], whole: true },
    { node: 'pad-undefined', route: 'runtime:spread', runtime: ['padding'], whole: true },
    { node: 'display', route: 'runtime:spread', runtime: ['padding'], whole: true },
    { node: 'disable-margin', route: 'runtime:spread', runtime: ['padding'], whole: true },
  ],
}

/** Typed wide, so the keys it overwrites are not a type error: overwriting is the shape under test. */
const dom: Record<string, string> = { title: 'from the spread', 'aria-label': 'from the spread', 'data-spread': 'yes', role: 'note' }
const blue: Record<string, string> = { color: 'rgb(0, 0, 200)' }
const top = { paddingTop: 2 }
const withCss = { css: { borderBottom: '2px solid rgb(0, 120, 0)' } }
const asSection = { as: 'section' }
const withTheme = { theme: { mode: 'light', system: { text: 'rgb(120, 0, 120)' } } }
const nothing: object | undefined = undefined
const empty: object | null = null
const letters = 'ab'
const getter = {
  get title() {
    return 'from a getter'
  },
}
const classAndStyle = { className: 'from-spread', style: { borderLeft: '3px solid rgb(0, 0, 0)' } }
const disable = { disableEmotion: true }
const padUndefined: Record<string, unknown> = { padding: undefined }
const flex = { display: 'flex' }
const disableWithMargin = { disableEmotion: true, margin: 2 }
const first = { 'data-first': '1' }
const second = { 'data-second': '2', fontStyle: 'italic' }

/** A markdown renderer's cell: the attributes it is handed first, its own styles after. */
const MarkdownCell = (props: object) => Td({ ...props, padding: 6, borderBottom: '1px solid rgb(0, 0, 0)' })

/** Forwards its props after a default padding, as wrapper components do. */
const Box = (props: object) => Div({ padding: 16, ...props })

export function App(): ReactElement {
  return Div({
    children: [
      Div({ key: 'dom', padding: 4, title: 'written before', ...dom, 'aria-label': 'written after', color: 'rgb(20, 20, 20)', children: 'dom spread' }),
      Div({ key: 'spread-wins', 'data-parity-exact': '', color: 'rgb(200, 0, 0)', padding: 2, ...blue, children: 'the spread wins' }),
      Div({ key: 'literal-wins', 'data-parity-exact': '', ...blue, color: 'rgb(0, 140, 0)', padding: 2, children: 'the literal wins' }),
      Div({ key: 'family-before', 'data-parity-exact': '', padding: 8, ...top, children: 'padding, then paddingTop' }),
      Div({ key: 'family-after', 'data-parity-exact': '', ...top, padding: 8, children: 'paddingTop, then padding' }),
      Div({ key: 'css', 'data-parity-exact': '', margin: 3, ...withCss, children: 'css in the spread' }),
      Div({ key: 'as', 'data-parity-exact': '', margin: 3, ...asSection, children: 'as in the spread' } as never),
      Span('theme in the spread', { key: 'theme', 'data-parity-exact': '', color: 'theme.text', ...withTheme } as never),
      Div({ key: 'undefined', padding: 1, ...nothing, children: 'undefined spread' }),
      Div({ key: 'null', padding: 1, ...empty, children: 'null spread' }),
      Div({ key: 'string', padding: 1, ...(letters as unknown as object), children: 'string spread' }),
      Div({ key: 'getter', padding: 1, ...getter, children: 'getter spread' }),
      Box({ key: 'wrapper-plain', title: 'forwarded', children: 'wrapper without css' }),
      Box({ key: 'wrapper-css', 'data-parity-exact': '', color: 'rgb(160, 80, 0)', paddingLeft: 30, children: 'wrapper with css' }),
      Div({ key: 'two', ...first, padding: 2, ...second, children: 'two spreads' }),
      Div({ key: 'class-style', padding: 4, ...classAndStyle, color: 'rgb(0, 60, 0)', children: 'className and style in the spread' }),
      Div({ key: 'disable', padding: 4, ...disable, children: 'disableEmotion in the spread' }),
      Div({ key: 'pad-undefined', 'data-parity-exact': '', padding: 4, ...padUndefined, children: 'padding: undefined in the spread' }),
      Div({ key: 'display', 'data-parity-exact': '', padding: 4, ...flex, children: [Span('x', { key: 'x' }), Span('y', { key: 'y' })] }),
      Div({ key: 'disable-margin', 'data-parity-exact': '', padding: 4, ...disableWithMargin, children: 'disableEmotion and margin in the spread' }),
      Table({
        key: 'markdown',
        children: Tbody({
          children: Tr({
            children: [
              MarkdownCell({ key: 'plain', align: 'left', style: { fontStyle: 'italic' }, children: 'attributes only' }),
              MarkdownCell({ key: 'sized', 'data-parity-exact': '', width: '40%', height: 30, children: 'width and height' }),
            ],
          }),
        }),
      }),
      Section({ key: 'section', children: 'end' }),
    ],
  } as never).render() as ReactElement
}
