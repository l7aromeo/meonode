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
  routes: ['RUNTIME:computed-key', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable', 'RUNTIME:props-spread', 'RUNTIME:read-key-hole'],
  routing: [
    { node: 'kf', route: 'RUNTIME:read-key-hole' },
    { node: 'spread', route: 'RUNTIME:props-spread' },
    { node: 'call', route: 'RUNTIME:css-not-literal' },
    { node: 'computed', route: 'RUNTIME:computed-key' },
    { node: 'untraced', route: 'RUNTIME:not-extractable' },
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
