// The target of the planted failures in plants.mjs, and a case of its own: a
// section with static styles, a breakpoint, a one-column multi-column box, a
// toggle whose pressed state switches a static colour, a hint the field
// mounts while it has focus, and a box its own hover moves from under the
// pointer.
import { useState, type ReactElement } from 'react'
import { Button, Div, Input, Section, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.style-props', 'place.css', 'at.media', 'dyn.state', 'dyn.conditional', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:unpartitioned'],
  routing: [{ node: 'exact', route: 'RUNTIME:css-not-literal' }],
  breakpoints: [600],
  firstPaint: true,
  steps: [{ name: 'press', click: '[data-act="toggle"]' }],
}

/** Held in a variable, so the node stays whole on the runtime path and renders as with extraction off. */
const EXACT_CSS = { fontStyle: 'italic' }

export function App(): ReactElement {
  const [pressed, setPressed] = useState(false)
  const [focused, setFocused] = useState(false)
  return Section({
    padding: 12,
    display: 'flex',
    gap: 8,
    css: { '@media (min-width: 600px)': { padding: 20 } },
    children: [
      Span('Plant target', { key: 'text', fontWeight: 600 }),
      Span('exact', { key: 'exact', 'data-parity-exact': '', css: EXACT_CSS }),
      // A multi-column box of one column, which a plant makes 1px taller; not stretched, so its height is its content's.
      Div({ key: 'columns', 'data-parity-columns': '', columnCount: 1, alignSelf: 'flex-start', children: 'columns' }),
      Input({ key: 'check', type: 'checkbox' }),
      Input({ key: 'field', placeholder: 'field', onFocus: () => setFocused(true), onBlur: () => setFocused(false) }),
      // An element only a forced state has, ahead of the toggle: mounting it moves the toggle to another place.
      focused && Span('hint', { key: 'hint', 'data-parity-hint': '', color: 'rgb(0, 0, 128)' }),
      Button(pressed ? 'On' : 'Off', {
        key: 'toggle',
        type: 'button',
        'data-act': 'toggle',
        'aria-pressed': pressed,
        color: pressed ? 'rgb(0, 128, 0)' : 'rgb(128, 0, 0)',
        onClick: () => setPressed(p => !p),
      }),
      // Its hover moves it from under the pointer, so no page holds its :hover or :active under real input.
      Span('away', { key: 'away', 'data-parity-away': '', display: 'inline-block', css: { '&:hover': { transform: 'translateY(48px)' } } }),
    ],
  }).render() as ReactElement
}
