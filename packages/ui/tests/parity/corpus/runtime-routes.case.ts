// Nodes and entries that stay on the runtime path: a keyframes value, a props
// spread, css from a call, a computed key, and a call site the compiler cannot
// trace (a factory chosen at runtime). The wrapper has no styles, so nothing
// in this module may extract.
import { keyframes } from '@emotion/react'
import type { ReactElement } from 'react'
import { Div, P, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['value.keyframes', 'value.string', 'place.css', 'env.ssr-hydrate'],
  routes: ['runtime:dynamic-value', 'runtime:spread', 'runtime:css-not-literal', 'runtime:css-spread-computed', 'runtime:untraced'],
  routing: [
    { node: 'kf', route: 'runtime:dynamic-value', runtime: ['animation'] },
    { node: 'spread', route: 'runtime:spread', runtime: ['fontWeight'] },
    { node: 'call', route: 'runtime:css-not-literal', runtime: ['css'] },
    { node: 'computed', route: 'runtime:css-spread-computed', runtime: ['borderStyle'] },
    { node: 'untraced', route: 'runtime:untraced', runtime: ['color', 'padding'] },
  ],
}

const fade = keyframes`from { opacity: 0.25; } to { opacity: 1; }`
const spacing = (n: number) => ({ padding: n * 2, margin: n })
const SIDE = 'Left'
const rest = { color: 'rgb(0, 90, 90)', 'data-spread': 'yes', title: 'spread' }

export function App(): ReactElement {
  const factory = SIDE.length > 3 ? Span : P
  return Div({
    children: [
      Div({ key: 'kf', animation: `${fade} 10s linear infinite paused`, children: 'keyframes' }),
      Div({ key: 'spread', fontWeight: 500, ...rest, children: 'spread' }),
      Div({ key: 'call', css: spacing(3), children: 'call' }),
      Div({ key: 'computed', css: { [`margin${SIDE}`]: 10, [`border${SIDE}Width`]: 2, borderStyle: 'solid' }, children: 'computed key' }),
      factory('untraced factory', { key: 'untraced', color: 'rgb(120, 0, 120)', padding: 3 }),
    ],
  } as never).render() as ReactElement
}
