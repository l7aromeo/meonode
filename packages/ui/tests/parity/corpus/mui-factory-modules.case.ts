// parity-compiler-options: {"factoryModules":["@meonode/mui"]}
//
// The mui case's call sites, compiled with @meonode/mui listed in
// factoryModules, as apps using it configure the compiler. The compiler then
// recognises the mui factories but extracts nothing from them, since only host
// factories extract: each mui node stays whole on the runtime path, while the
// MeoNode box around them extracts as usual.
import type { ReactElement } from 'react'
import { Button, Chip, Paper } from '@meonode/mui'
import { Div } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.mui', 'place.style-props', 'place.css', 'sel.pseudo-class', 'env.ssr-hydrate'],
  routes: ['NAMED', 'RUNTIME:not-extractable'],
  routing: [
    { node: 'box', route: 'NAMED' },
    { node: 'button', route: 'RUNTIME:not-extractable' },
    { node: 'chip', route: 'RUNTIME:not-extractable' },
    { node: 'paper', route: 'RUNTIME:not-extractable' },
  ],
}

export function App(): ReactElement {
  return Div({
    key: 'box',
    padding: 8,
    borderTop: '1px solid rgb(0, 0, 0)',
    children: [
      Button({ key: 'button', variant: 'contained', margin: 4, css: { '&:hover': { letterSpacing: 1 } }, children: 'mui button' }),
      Chip({ key: 'chip', label: 'chip', marginLeft: 6 }),
      Paper({ key: 'paper', elevation: 2, padding: 10, children: 'paper' }),
    ],
  } as never).render() as ReactElement
}
