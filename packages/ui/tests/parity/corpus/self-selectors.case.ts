// Selectors that name & more than once. & is the node's own class, made from
// all of its styles, so & ~ & and & & match only an element whose styles are
// all the same; neighbours and descendants that share the block but differ
// elsewhere must not match it.
import type { ReactElement } from 'react'
import { Div, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.sibling', 'sel.descendant', 'place.css', 'env.ssr-hydrate'],
  routes: ['runtime:self-reference'],
  routing: [
    { node: 'like-b', route: 'runtime:self-reference', runtime: ['color', '& ~ &'], whole: true },
    { node: 'unlike-b', route: 'runtime:self-reference', runtime: ['color', '& ~ &'], whole: true },
    { node: 'inner-unlike', route: 'runtime:self-reference', runtime: ['color', '& &'], whole: true },
  ],
}

const later = { '& ~ &': { fontWeight: 700 } }

export function App(): ReactElement {
  return Div({
    children: [
      Div({ key: 'like-a', color: 'rgb(0, 0, 0)', css: { '& ~ &': { fontWeight: 700 } }, children: 'alike, first' }),
      Span('between', { key: 'between' }),
      Div({ key: 'like-b', color: 'rgb(0, 0, 0)', css: { '& ~ &': { fontWeight: 700 } }, children: 'alike, later' }),
      Div({ key: 'unlike-a', color: 'rgb(150, 0, 0)', css: { '& ~ &': { textDecoration: 'underline' } }, children: 'unlike, first' }),
      Div({ key: 'unlike-b', color: 'rgb(0, 0, 150)', css: { '& ~ &': { textDecoration: 'underline' } }, children: 'unlike, later' }),
      Div({
        key: 'outer',
        color: 'rgb(150, 0, 0)',
        css: { '& &': { fontStyle: 'italic' } },
        children: [
          Div({ key: 'inner-unlike', color: 'rgb(0, 0, 150)', css: { '& &': { fontStyle: 'italic' } }, children: 'inside, unlike' }),
          Div({ key: 'inner-like', color: 'rgb(150, 0, 0)', css: { '& &': { fontStyle: 'italic' } }, children: 'inside, alike' }),
        ],
      }),
      Div({ key: 'held', css: later, children: 'held block' }),
    ],
  } as never).render() as ReactElement
}
