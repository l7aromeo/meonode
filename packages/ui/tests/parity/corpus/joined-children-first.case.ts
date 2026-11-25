// Calls of factories imported from another module (parts/joined.ts) as the
// children of a children-first call whose own style is known only at run
// time: a spread in its css, a css built by a call, a CSS prop read at run
// time, a sole child, nested arrays, and props holding a spread or `as`. The
// parent stays on the runtime path; each child is still in node position, so
// the compiler joins it with the factory's defaults at run time
// (`__meoFactoryCall`). A child whose own style is read at run time is left
// as written. Every element must render as with extraction off.
import type { ReactElement } from 'react'
import { Button, Div, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'
import { Chip, Themed } from './parts/joined.js'

/** A style fragment held in a variable, which keeps its parent on the runtime path. */
const outline = { outline: '1px solid rgb(0, 0, 120)' }

/** A style fragment built by a call, read at run time. */
const frame = () => ({ borderLeft: '3px solid rgb(120, 0, 0)' })

/** A colour read at run time. */
const accent = () => 'rgb(0, 110, 110)'

/** Props spread into a parent, read at run time. */
const buttonProps = { type: 'button', padding: 4 } as const

export const meta: CaseMeta = {
  shapes: ['place.create-node', 'place.css', 'place.style-props', 'place.spread', 'place.as', 'value.runtime', 'value.token', 'env.ssr-hydrate'],
  routes: ['JOINED', 'RUNTIME:computed-key', 'RUNTIME:dynamic-value', 'RUNTIME:props-spread', 'RUNTIME:node-prop'],
  routing: [
    { node: 'css-spread', route: 'RUNTIME:computed-key' },
    { node: 'css-spread-child', route: 'JOINED' },
    { node: 'css-call', route: 'RUNTIME:computed-key' },
    { node: 'css-call-child', route: 'JOINED' },
    { node: 'prop-call', route: 'RUNTIME:dynamic-value' },
    { node: 'prop-call-child', route: 'JOINED' },
    { node: 'sole', route: 'RUNTIME:computed-key' },
    { node: 'sole-child', route: 'JOINED' },
    { node: 'nested', route: 'RUNTIME:computed-key' },
    { node: 'nested-a', route: 'JOINED' },
    { node: 'nested-b', route: 'JOINED' },
    { node: 'nested-themed', route: 'JOINED' },
    { node: 'props-spread', route: 'RUNTIME:props-spread' },
    { node: 'props-spread-child', route: 'JOINED' },
    { node: 'as-prop', route: 'RUNTIME:node-prop' },
    { node: 'as-child', route: 'JOINED' },
    { node: 'dynamic-parent', route: 'RUNTIME:computed-key' },
    { node: 'dynamic-child', route: 'RUNTIME:dynamic-value' },
  ],
  steps: [{ name: 'dark mode', mode: 'dark' }],
}

export function App(): ReactElement {
  return Div({
    children: [
      Button([Chip({ key: 'css-spread-child', margin: 3, children: 'css spread' })], { key: 'css-spread', type: 'button', css: { ...outline } }),
      Button([Chip({ key: 'css-call-child', margin: 3, children: 'css call' })], { key: 'css-call', type: 'button', css: { ...frame() } }),
      Span([Chip({ key: 'prop-call-child', padding: 5, children: 'prop call' })], { key: 'prop-call', color: accent() }),
      Button(Chip({ key: 'sole-child', margin: 2, children: 'sole child' }), { key: 'sole', type: 'button', css: { ...outline } }),
      Span(
        [
          [Chip({ key: 'nested-a', margin: 1, children: 'nested a' }), Chip({ key: 'nested-b', css: { color: 'rgb(0, 0, 150)' }, children: 'nested b' })],
          Themed({ key: 'nested-themed', margin: 1, children: 'themed' }),
        ],
        { key: 'nested', css: { ...frame(), ...outline } },
      ),
      Button([Chip({ key: 'props-spread-child', margin: 3, children: 'props spread' })], { key: 'props-spread', ...buttonProps }),
      Span([Chip({ key: 'as-child', margin: 3, children: 'as' })], { key: 'as-prop', as: 'strong' }),
      Button([Chip({ key: 'dynamic-child', color: accent(), children: 'own style at run time' })], {
        key: 'dynamic-parent',
        type: 'button',
        css: { ...outline },
      }),
    ],
  } as never).render() as ReactElement
}
