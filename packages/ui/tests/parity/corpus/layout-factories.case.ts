// Layout factories with initial props (Root, Column, Row, Grid, Center, Main,
// and the positioning factories), as a compiler that extracts their initial
// props sees them: static call sites, a partial one with a runtime value, and
// call-site props that override an initial one (Row as a grid).
import { useState, type ReactElement } from 'react'
import { Absolute, Button, Center, Column, Div, Fixed, Grid, Main, Relative, Root, Row, Span, Sticky } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.create-node', 'place.style-props', 'dyn.state', 'env.ssr-hydrate'],
  routes: ['FACTORY_MERGED'],
  routing: [
    { node: 'column', route: 'FACTORY_MERGED' },
    { node: 'row', route: 'FACTORY_MERGED' },
    { node: 'row-partial', route: 'FACTORY_MERGED' },
    { node: 'row-grid', route: 'FACTORY_MERGED' },
    { node: 'grid', route: 'FACTORY_MERGED' },
    { node: 'center', route: 'FACTORY_MERGED' },
    { node: 'main', route: 'FACTORY_MERGED' },
    { node: 'relative', route: 'FACTORY_MERGED' },
    { node: 'absolute', route: 'FACTORY_MERGED' },
  ],
  steps: [{ name: 'step 1', click: '[data-act="next"]' }],
}

export function App(): ReactElement {
  const [n, setN] = useState(1)
  return Root({
    key: 'root',
    children: [
      Button('next', { key: 'next', type: 'button', 'data-act': 'next', onClick: () => setN(v => v + 1) }),
      Column({ key: 'column', gap: 4, children: [Span('a', { key: 'a' }), Span('b', { key: 'b' })] }),
      Row({ key: 'row', gap: 6, padding: 2, children: [Span('c', { key: 'c' }), Span('d', { key: 'd' })] }),
      Row({ key: 'row-partial', gap: n * 3, children: [Span('e', { key: 'e' }), Span('f', { key: 'f' })] }),
      Row({ key: 'row-grid', display: 'grid', gridTemplateColumns: '1fr 1fr', children: [Span('g', { key: 'g' }), Span('h', { key: 'h' })] }),
      Grid({ key: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', children: [Span('i', { key: 'i' }), Span('j', { key: 'j' }), Span('k', { key: 'k' })] }),
      Center({ key: 'center', height: 40, children: 'centred' }),
      Main({ key: 'main', padding: 4, children: 'main' }),
      Relative({
        key: 'relative',
        height: 60,
        children: [
          Absolute({ key: 'absolute', top: 2, right: 4, children: 'absolute' }),
          Sticky({ key: 'sticky', top: 0, children: 'sticky' }),
          Fixed({ key: 'fixed', bottom: 4, left: 4, children: 'fixed' }),
        ],
      }),
      Div({ key: 'plain', children: 'plain' }),
    ],
  } as never).render() as ReactElement
}
