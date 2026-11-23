// Nested selectors two, three and four deep, with at-rules between the levels
// (a selector inside @media inside a selector, and @media inside a selector
// inside @supports), and selector lists at each level: a list inside a list,
// whose product the output must hold, and commas inside brackets, quotes and
// parentheses, which do not split a list.
import type { ReactElement } from 'react'
import { B, Div, Em, I, P, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: [
    'sel.chained',
    'sel.descendant',
    'sel.child',
    'sel.ancestor',
    'sel.comma',
    'sel.pseudo-class',
    'at.nested',
    'at.media',
    'at.supports',
    'place.css',
    'env.ssr-hydrate',
  ],
  routes: ['CARRIER', 'NAMED'],
  routing: [
    { node: 'two', route: 'CARRIER' },
    { node: 'three', route: 'NAMED' },
    { node: 'dark', route: 'NAMED' },
    { node: 'four', route: 'NAMED' },
    { node: 'media-between', route: 'NAMED' },
    { node: 'supports-outer', route: 'NAMED' },
    { node: 'list-product', route: 'NAMED' },
    { node: 'list-deep', route: 'NAMED' },
    { node: 'commas', route: 'NAMED' },
  ],
  breakpoints: [600],
}

export function App(): ReactElement {
  return Div({
    children: [
      Div({ key: 'two', tabIndex: 0, css: { '&:hover': { '& span': { color: 'rgb(200, 0, 0)' } } }, children: Span('two deep', { key: 's' }) }),
      Div({
        key: 'three',
        css: { '& .a': { '&:hover': { '& > b': { color: 'rgb(0, 120, 0)' } } } },
        children: Div({ key: 'a', className: 'a', children: [B('three deep', { key: 'b' }), Span(' not a child b', { key: 's' })] }),
      }),
      Div({
        key: 'dark-wrap',
        className: 'dark',
        children: Div({ key: 'dark', css: { '.dark &': { '&:hover': { textDecoration: 'underline' } } }, children: 'ancestor, then hover' }),
      }),
      Div({
        key: 'four',
        css: { '& .a': { '& .b': { '&:hover': { '& i': { color: 'rgb(0, 0, 200)' } } } } },
        children: Div({ key: 'a', className: 'a', children: Div({ key: 'b', className: 'b', children: I('four deep', { key: 'i' }) }) }),
      }),
      Div({
        key: 'media-between',
        css: { '& p': { '@media (min-width: 600px)': { '&:hover': { color: 'rgb(150, 0, 150)' }, fontWeight: 700 } } },
        children: P('selector in media in selector', { key: 'p' }),
      }),
      Div({
        key: 'supports-outer',
        css: { '@supports (display: grid)': { '& span': { '@media (min-width: 600px)': { color: 'rgb(0, 130, 130)' }, letterSpacing: 1 } } },
        children: Span('media in selector in supports', { key: 's' }),
      }),
      Div({
        key: 'list-product',
        tabIndex: 0,
        css: { '& p, & span': { '&:hover, &:focus': { color: 'rgb(180, 90, 0)' } } },
        children: [P('list paragraph', { key: 'p' }), Span('list span', { key: 's' })],
      }),
      Div({
        key: 'list-deep',
        css: { '& .a, & .b': { '& i, & em': { fontStyle: 'normal', fontWeight: 700 } } },
        children: [
          Div({ key: 'a', className: 'a', children: [I('a i', { key: 'i' }), Em('a em', { key: 'em' })] }),
          Div({ key: 'b', className: 'b', children: [I('b i', { key: 'i' }), Em('b em', { key: 'em' })] }),
        ],
      }),
      Div({
        key: 'commas',
        'data-x': 'a,b',
        className: 'c',
        css: {
          '&[data-x="a,b"]': { borderLeft: '3px solid rgb(0, 0, 0)' },
          '&:not(.a, .b)': { paddingLeft: 6 },
          '&:is(.p, .c) span': { color: 'rgb(90, 0, 90)' },
        },
        children: Span('commas in brackets, quotes and parentheses', { key: 's' }),
      }),
    ],
  } as never).render() as ReactElement
}
