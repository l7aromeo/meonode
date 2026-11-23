// @meonode/mui components with MeoNode styles beside MUI's own: a contained
// button with a hover rule, a chip, and a paper inside a MeoNode box whose
// static styles extract. Each side's mui copy renders through that side's
// runtime.
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
