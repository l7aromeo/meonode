// Selectors: pseudo-classes and pseudo-elements, chained; the element's own
// class and attribute; descendant, child and sibling combinators; an ancestor
// context; comma lists; :where, :is and :has.
import type { ReactElement } from 'react'
import { A, Div, Em, Input, Li, P, Span, Ul } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: [
    'sel.pseudo-class',
    'sel.pseudo-element',
    'sel.chained',
    'sel.self-class',
    'sel.self-attr',
    'sel.descendant',
    'sel.child',
    'sel.sibling',
    'sel.ancestor',
    'sel.comma',
    'sel.where-is-has',
    'place.css',
    'env.ssr-hydrate',
  ],
  routes: ['STATIC'],
}

export function App(): ReactElement {
  return Div({
    className: 'box',
    'data-state': 'open',
    padding: 8,
    css: {
      '&:hover': { backgroundColor: 'rgb(250, 240, 200)' },
      '&:focus-within': { outline: '1px dashed rgb(0, 0, 0)' },
      '&::before': { content: '"«"', color: 'rgb(200, 0, 0)' },
      '&::after': { content: '"»"', marginLeft: 4 },
      '&:hover::after': { color: 'rgb(0, 160, 0)' },
      '&.box': { borderLeft: '3px solid rgb(0, 0, 200)' },
      '&[data-state="open"]': { borderRight: '3px solid rgb(200, 0, 200)' },
      '& p': { margin: '2px 0' },
      '& > ul': { paddingLeft: 12 },
      '& p + p': { color: 'rgb(90, 90, 90)' },
      '& p ~ ul': { listStyle: 'square' },
      '.wrapper &': { fontStyle: 'italic' },
      '& a, & em': { textDecoration: 'underline dotted' },
      '& :where(li)': { paddingTop: 1 },
      '& :is(li, p):first-child': { fontWeight: 700 },
      '&:has(input:checked)': { boxShadow: '0 0 0 2px rgb(0, 128, 255)' },
      '& input:disabled': { opacity: 0.5 },
      '& input:focus-visible': { outline: '2px solid rgb(255, 100, 0)' },
      '& a:active': { color: 'rgb(255, 0, 0)' },
    },
    children: [
      P('first', { key: 'p1' }),
      P('second', { key: 'p2' }),
      Ul({ key: 'ul', children: [Li({ key: '1', children: 'one' }), Li({ key: '2', children: 'two' })] }),
      A({ key: 'a', href: '#x', children: 'link' }),
      Em('emphasis', { key: 'em' }),
      Input({ key: 'i1', type: 'checkbox', defaultChecked: true }),
      Input({ key: 'i2', type: 'text', disabled: true, defaultValue: 'off' }),
      Span('span', { key: 's', css: { '&:active': { color: 'rgb(0, 0, 255)' }, '&:focus': { color: 'rgb(0, 255, 0)' } }, tabIndex: 0 }),
    ],
  }).render() as ReactElement
}
