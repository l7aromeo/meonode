// Combinations whose result depends on rule order, which the compiler leaves
// on the runtime path: shorthand beside longhand in one context, one property
// in two non-base contexts, a property overlapping one already on the runtime
// path, layout properties on a partial node, per-node selector blocks with a
// runtime entry and an unsupported at-rule. Beside each, the near shape the
// compiler does extract: base plus one context, two longhands that do not
// overlap, and the prefixed selectors (::placeholder, :read-only), which
// extract with Emotion's prefixed copies.
import { useState, type ReactElement } from 'react'
import { Button, Div, Em, Input, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.pseudo-class', 'sel.descendant', 'place.css', 'place.style-props', 'dyn.state', 'env.ssr-hydrate'],
  routes: [
    'STATIC',
    'runtime:overlap-one-context',
    'runtime:multi-context',
    'runtime:overlap-runtime',
    'runtime:partial-layout',
    'runtime:selector-block-mixed',
    'runtime:at-rule-other',
    'runtime:dynamic-value',
  ],
  routing: [
    { node: 'shorthand', route: 'runtime:overlap-one-context', runtime: ['padding', 'paddingTop'], extracted: ['color'] },
    { node: 'logical', route: 'runtime:overlap-one-context', runtime: ['marginInline', 'marginLeft'], extracted: ['color'] },
    { node: 'longhands', route: 'STATIC', extracted: ['marginTop', 'marginLeft', 'top', 'left'] },
    { node: 'contexts', route: 'runtime:multi-context', runtime: ['&:hover', '&:focus'], extracted: ['padding'] },
    { node: 'one-context', route: 'STATIC', extracted: ['color', '&:hover'] },
    { node: 'overlap', route: 'runtime:overlap-runtime', runtime: ['margin', 'marginTop'], extracted: ['color'] },
    { node: 'partial', route: 'runtime:partial-layout', runtime: ['color', 'display', 'flexDirection', 'minWidth', 'overflow'], extracted: ['padding'] },
    { node: 'blocks', route: 'runtime:selector-block-mixed', runtime: ['& span', '& em'] },
    { node: 'layer', route: 'runtime:at-rule-other', runtime: ['@layer parity'] },
    { node: 'placeholder', route: 'STATIC', extracted: ['&::placeholder'] },
    { node: 'readonly', route: 'STATIC', extracted: ['&:read-only'] },
  ],
  steps: [{ name: 'step 1', click: '[data-act="next"]' }],
}

export function App(): ReactElement {
  const [n, setN] = useState(0)
  const tone = n > 0 ? 'rgb(0, 0, 200)' : 'rgb(0, 120, 0)'
  return Div({
    children: [
      Button('next', { key: 'next', type: 'button', 'data-act': 'next', onClick: () => setN(v => v + 1) }),
      Div({ key: 'shorthand', padding: 8, paddingTop: 2, color: 'rgb(10, 10, 10)', children: 'shorthand then longhand' }),
      Div({ key: 'logical', marginInline: 12, marginLeft: 4, color: 'rgb(10, 10, 10)', children: 'logical then physical' }),
      Div({ key: 'longhands', position: 'relative', marginTop: 3, marginLeft: 5, top: 1, left: 2, children: 'longhands' }),
      Span('two contexts', {
        key: 'contexts',
        tabIndex: 0,
        padding: 2,
        css: { '&:hover': { color: 'rgb(200, 0, 0)' }, '&:focus': { color: 'rgb(0, 0, 200)' } },
      }),
      Span('base and one context', { key: 'one-context', color: 'rgb(0, 0, 0)', css: { '&:hover': { color: 'rgb(200, 0, 200)' } } }),
      Div({ key: 'overlap', margin: n * 2, marginTop: 6, color: 'rgb(0, 0, 0)', children: 'overlaps a runtime value' }),
      Div({
        key: 'partial',
        color: tone,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        overflow: 'hidden',
        padding: 3,
        children: [Span('x', { key: 'x' }), Span('y', { key: 'y' })],
      }),
      Div({
        key: 'blocks',
        css: { '& span': { color: tone }, '& em': { fontWeight: 700 } },
        children: [Span('block span', { key: 's' }), Em('block em', { key: 'e' })],
      }),
      Div({ key: 'layer', css: { '@layer parity': { color: 'rgb(120, 60, 0)' } }, children: 'layer' }),
      Input({ key: 'placeholder', placeholder: 'placeholder', css: { '&::placeholder': { color: 'rgb(150, 0, 150)' } } }),
      Input({ key: 'readonly', readOnly: true, defaultValue: 'read only', css: { '&:read-only': { backgroundColor: 'rgb(235, 235, 235)' } } }),
    ],
  } as never).render() as ReactElement
}
