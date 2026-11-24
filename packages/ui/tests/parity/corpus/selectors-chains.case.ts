// Long chains on one compound, with the states each needs forced together, and
// a chain built by nesting next to the same chain written flat on one node.
import type { ReactElement } from 'react'
import { Button, Div, Input, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: [
    'sel.chain-long',
    'sel.chained',
    'sel.pseudo-class',
    'sel.pseudo-element',
    'sel.self-class',
    'sel.self-attr',
    'sel.not',
    'sel.child',
    'place.css',
    'env.ssr-hydrate',
  ],
  routes: ['NAMED'],
  routing: [
    { node: 'hover-within', route: 'NAMED' },
    { node: 'focus-hover-after', route: 'NAMED' },
    { node: 'compound', route: 'NAMED' },
    { node: 'odd-1', route: 'NAMED' },
    { node: 'only', route: 'NAMED' },
    { node: 'three-states', route: 'NAMED' },
    { node: 'attr-hover-child', route: 'NAMED' },
    { node: 'nested-and-flat', route: 'NAMED' },
  ],
  forceCombos: [
    ['hover', 'focus-within'],
    ['focus', 'hover'],
    ['hover', 'active', 'focus'],
  ],
}

export function App(): ReactElement {
  return Div({
    children: [
      Div({
        key: 'hover-within',

        css: { '&:hover:focus-within': { outline: '2px solid rgb(0, 0, 200)' } },
        children: Input({ key: 'i', defaultValue: 'focus me while hovering' }),
      }),
      Button('focus, hover, after', {
        key: 'focus-hover-after',
        type: 'button',
        css: { '&:focus:hover::after': { content: '" ✓"', color: 'rgb(0, 140, 0)' } },
      }),
      Div({ key: 'compound', className: 'a b', 'data-x': '1', css: { '&.a.b[data-x="1"]:not(.c)::before': { content: '"» "' } }, children: 'compound chain' }),
      Div({
        key: 'compound-c',
        className: 'a b c',
        'data-x': '1',
        css: { '&.a.b[data-x="1"]:not(.c)::before': { content: '"» "' } },
        children: 'compound chain with .c, does not',
      }),
      Div({
        key: 'odd',
        children: [
          Span('odd, hover', { key: 'odd-1', css: { '&:nth-child(2n+1):hover': { color: 'rgb(200, 0, 0)' } } }),
          Span('even, hover', { key: 'odd-2', css: { '&:nth-child(2n+1):hover': { color: 'rgb(200, 0, 0)' } } }),
        ],
      }),
      Div({ key: 'only-wrap', children: Span('only child', { key: 'only', css: { '&:first-child:last-child': { fontWeight: 700 } } }) }),
      Div({
        key: 'not-only-wrap',
        children: [Span('not only', { key: 'not-only-a', css: { '&:first-child:last-child': { fontWeight: 700 } } }), Span('sibling', { key: 'not-only-b' })],
      }),
      Button('hover, active, focus', { key: 'three-states', type: 'button', css: { '&:hover:active:focus': { backgroundColor: 'rgb(255, 220, 220)' } } }),
      Div({
        key: 'attr-hover-child',
        x: '',

        css: { '&[x]:hover > span:first-child::after': { content: '" ←"' } },
        children: [Span('first span', { key: 'a' }), Span('second span', { key: 'b' })],
      } as never),
      Div({
        key: 'nested-and-flat',
        className: 'a b',

        css: {
          '&.a': { '&.b': { '&:hover': { '&::after': { content: '" nested"', color: 'rgb(200, 0, 0)' } } } },
          '&.a.b:hover::after': { content: '" flat"', color: 'rgb(0, 0, 200)' },
        },
        children: 'nested, then flat',
      }),
    ],
  } as never).render() as ReactElement
}
