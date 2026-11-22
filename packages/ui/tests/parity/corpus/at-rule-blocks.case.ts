// At-rule and selector blocks the static path does not write, on nodes whose
// other entries extract: a token in a media prelude hiding a node, the same
// property as a static base value (which the block pulls onto the runtime
// path), @keyframes beside the animation that uses it (paused at a fixed
// frame, so the frame shows the keyframes resolved), and a sibling block
// (& + &) over a static margin, on identical neighbours and on neighbours whose
// other styles differ. The layout factory form keeps its initial props on the
// runtime path.
import type { ReactElement } from 'react'
import { Column, Div } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['at.token-in-key', 'at.media', 'value.keyframes', 'sel.sibling', 'place.css', 'env.ssr-hydrate'],
  routes: ['STATIC', 'runtime:at-rule-token', 'runtime:at-rule-other', 'runtime:overlap-runtime', 'runtime:self-reference'],
  routing: [
    {
      node: 'column',
      route: 'runtime:at-rule-token',
      runtime: ['@media (max-width: theme.breakpoint.md)', 'display', 'flexDirection'],
      extracted: ['padding'],
    },
    { node: 'hide', route: 'runtime:at-rule-token', runtime: ['@media (max-width: theme.breakpoint.md)', 'display'], extracted: ['padding'] },
    { node: 'color', route: 'runtime:overlap-runtime', runtime: ['color', '@media (max-width: theme.breakpoint.md)'], extracted: ['padding'] },
    { node: 'spin', route: 'runtime:at-rule-other', runtime: ['@keyframes parity-spin'], extracted: ['opacity', 'padding', 'animation'] },
    { node: 'sibling-2', route: 'runtime:self-reference', runtime: ['marginTop', '& + &', 'color'], whole: true },
    { node: 'unlike-2', route: 'runtime:self-reference', runtime: ['marginTop', '& + &', 'color'], whole: true },
  ],
  breakpoints: [600],
}

export function App(): ReactElement {
  return Div({
    children: [
      Column({ key: 'column', padding: 8, css: { '@media (max-width: theme.breakpoint.md)': { display: 'none' } }, children: 'column hidden when narrow' }),
      Div({
        key: 'hide',
        display: 'flex',
        padding: 8,
        css: { '@media (max-width: theme.breakpoint.md)': { display: 'none' } },
        children: 'div hidden when narrow',
      }),
      Div({
        key: 'color',
        color: 'rgb(200, 0, 0)',
        padding: 4,
        css: { '@media (max-width: theme.breakpoint.md)': { color: 'rgb(0, 0, 200)' } },
        children: 'red, blue when narrow',
      }),
      Div({
        key: 'spin',
        opacity: 1,
        padding: 2,
        css: {
          animation: 'parity-spin 1s linear -0.25s infinite paused',
          '@keyframes parity-spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        },
        children: 'a quarter turn',
      }),
      Div({ key: 'sibling-1', marginTop: 2, color: 'rgb(0, 0, 0)', css: { '& + &': { marginTop: 10 } }, children: 'first sibling' }),
      Div({ key: 'sibling-2', marginTop: 2, color: 'rgb(0, 0, 0)', css: { '& + &': { marginTop: 10 } }, children: 'second sibling' }),
      Div({ key: 'gap', children: 'between the pairs' }),
      // The same block on neighbours whose other styles differ: & is each node's own class, so neither matches the other's & + &.
      Div({ key: 'unlike-1', marginTop: 2, color: 'rgb(150, 0, 0)', css: { '& + &': { marginTop: 10 } }, children: 'red neighbour' }),
      Div({ key: 'unlike-2', marginTop: 2, color: 'rgb(0, 0, 150)', css: { '& + &': { marginTop: 10 } }, children: 'blue neighbour' }),
    ],
  } as never).render() as ReactElement
}
