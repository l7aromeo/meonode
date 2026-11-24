// Values that stay on the runtime path beside static values the same node
// extracts: a let, a member read, a call and a conditional of calls; fallback arrays; ||, ?? and &&
// with a non-boolean left side (and a boolean one, which switches); a runtime
// value in a property the prefixer rewrites (and in a sizing property, which
// takes a variable); and values stylis would read differently.
import { useState, type ReactElement } from 'react'
import { Button, Div, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['value.runtime', 'value.fallback-array', 'dyn.conditional', 'dyn.state', 'place.style-props', 'env.ssr-hydrate'],
  routes: ['NAMED', 'RUNTIME:dynamic-value', 'TEMPLATE'],
  routing: [
    { node: 'let', route: 'RUNTIME:dynamic-value' },
    { node: 'member', route: 'RUNTIME:dynamic-value' },
    { node: 'call', route: 'RUNTIME:dynamic-value' },
    { node: 'call-conditional', route: 'RUNTIME:dynamic-value' },
    { node: 'array', route: 'RUNTIME:dynamic-value' },
    { node: 'or', route: 'RUNTIME:dynamic-value' },
    { node: 'nullish', route: 'RUNTIME:dynamic-value' },
    { node: 'and', route: 'RUNTIME:dynamic-value' },
    { node: 'switch', route: 'NAMED' },
    { node: 'prefixed', route: 'RUNTIME:dynamic-value' },
    { node: 'sized', route: 'TEMPLATE' },
    { node: 'areas', route: 'NAMED' },
    { node: 'comment', route: 'NAMED' },
    { node: 'static', route: 'NAMED' },
  ],
  steps: [
    { name: 'step 1', click: '[data-act="next"]' },
    { name: 'step 2', click: '[data-act="next"]' },
  ],
}

// eslint-disable-next-line prefer-const -- a let binding is the shape under test
let accent = 'rgb(160, 0, 80)'
const PALETTE = { ink: 'rgb(20, 20, 60)' }
const size = (n: number) => `${n * 16}px`
const getRed = () => 'rgb(200, 0, 0)'
const getPrimary = () => 'rgb(0, 60, 160)'
const INK = 'rgb(30, 30, 30)'

export function App(): ReactElement {
  const [n, setN] = useState(0)
  const maybe = n % 2 === 1 ? 'rgb(0, 100, 200)' : ''
  const unset = n > 1 ? 'rgb(200, 100, 0)' : null
  const label = n > 0 ? 'underline' : ''
  const select = n % 2 === 0 ? 'text' : 'none'
  // True on step 1 only, so the steps reach both branches.
  const error = () => n % 2 === 1
  return Div({
    children: [
      Button('next', { key: 'next', type: 'button', 'data-act': 'next', onClick: () => setN(v => v + 1) }),
      Div({ key: 'let', color: accent, padding: 4, children: 'let' }),
      Div({ key: 'member', color: PALETTE.ink, marginLeft: 2, children: 'member' }),
      Div({ key: 'call', width: size(n + 3), borderTop: '1px solid rgb(0, 0, 0)', children: 'call' }),
      Div({
        key: 'call-conditional',
        color: error() ? getRed() : getPrimary(),
        paddingTop: 3,
        borderBottom: '1px solid rgb(0, 0, 0)',
        children: 'call conditional',
      }),
      Div({
        key: 'array',
        background: ['rgb(240, 240, 255)', 'linear-gradient(rgb(240, 240, 255), rgb(255, 255, 255))'],
        padding: 3,
        children: 'array',
      } as never),
      Span('or', { key: 'or', color: maybe || 'rgb(0, 0, 0)', paddingLeft: 2 }),
      Span('nullish', { key: 'nullish', color: unset ?? 'rgb(0, 0, 0)', paddingLeft: 3 }),
      Span('and', { key: 'and', textDecoration: label && 'underline', paddingLeft: 4 } as never),
      Span('switch', { key: 'switch', textDecoration: n > 0 && 'line-through', fontStyle: !label && 'italic', paddingLeft: 5 } as never),
      Div({ key: 'prefixed', userSelect: select, padding: 2, children: 'prefixed' } as never),
      Div({ key: 'sized', width: `${(n + 2) * 10}%`, padding: 1, children: 'sized' }),
      Div({
        key: 'areas',
        display: 'grid',
        gridTemplateAreas: '"a b"\n"c d"',
        gap: 2,
        children: [Span('a', { key: 'a', gridArea: 'a' }), Span('d', { key: 'd', gridArea: 'd' })],
      }),
      Div({ key: 'comment', color: 'rgb(0, 80, 0) /* green ink */', marginTop: 2, children: 'comment' }),
      Div({ key: 'static', color: INK, padding: 6, borderLeft: `2px solid ${INK}`, children: 'static' }),
    ],
  } as never).render() as ReactElement
}
