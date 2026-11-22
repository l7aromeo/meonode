// Keys that start with a colon and have no &, which Emotion attaches to the
// node itself (:hover becomes .N:hover, not .N :hover): at the top level, in a
// list with &, before a later &, and nested under a selector, a pseudo-class
// and a media query. Also a list whose first item holds a ) inside quotes, and
// a key written across lines.
import type { ReactElement } from 'react'
import { Div, P, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.pseudo-class', 'sel.pseudo-element', 'sel.chained', 'sel.comma', 'sel.child', 'at.nested', 'place.css', 'env.ssr-hydrate'],
  routes: ['STATIC'],
  breakpoints: [600],
}

export function App(): ReactElement {
  return Div({
    children: [
      Div({ key: 'hover', tabIndex: 0, css: { ':hover': { color: 'rgb(200, 0, 0)' } }, children: [Span('own text', { key: 's' })] }),
      Div({ key: 'before', css: { '::before': { content: '"‹"' } }, children: Span('inner span', { key: 's' }) }),
      Div({ key: 'list-after', css: { '&, ::after': { color: 'rgb(0, 100, 0)', content: '"›"' } }, children: Span('inner', { key: 's' }) }),
      Div({
        key: 'colon-then-self',
        className: 'outer',
        css: { ':focus-within &': { outline: '1px solid rgb(0, 0, 0)' } },
        children: Span('colon key before &', { key: 's', tabIndex: 0 }),
      }),
      Div({ key: 'nested-selector', css: { '& span': { ':hover': { color: 'rgb(0, 0, 200)' } } }, children: Span('nested under & span', { key: 's' }) }),
      Div({ key: 'nested-pseudo', tabIndex: 0, css: { '&:focus': { '::after': { content: '" focused"' } } }, children: 'nested under &:focus' }),
      Div({ key: 'nested-media', css: { '@media (min-width: 600px)': { ':hover': { color: 'rgb(120, 0, 120)' } } }, children: 'nested under a media query' }),
      Div({
        key: 'paren-in-quotes',
        'data-x': 'a)b',
        css: { '[data-x="a)b"], &': { fontWeight: 700 } },
        children: Span('a ) inside quotes', { key: 's', 'data-x': 'a)b' }),
      }),
      Div({
        key: 'multiline',
        css: { '&\n>\np': { fontStyle: 'italic' } },
        children: [P('a child p', { key: 'p' }), Div({ key: 'd', children: P('a grandchild p', { key: 'g' }) })],
      }),
    ],
  } as never).render() as ReactElement
}
