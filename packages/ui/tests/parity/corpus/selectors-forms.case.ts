// Selector keys without &, and & in unusual places: :hover, ::before, span,
// > span, + span and ~ span written bare; &&, & & and a nested & + &; :not(&),
// an attribute ancestor and :where() before &; & only inside :is or :where
// lists, and inside :not after a type. Each node's states are forced.
import type { ReactElement } from 'react'
import { Div, P, Section, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: [
    'sel.pseudo-class',
    'sel.pseudo-element',
    'sel.descendant',
    'sel.child',
    'sel.sibling',
    'sel.ancestor',
    'sel.where-is-has',
    'place.css',
    'env.ssr-hydrate',
  ],
  routes: ['STATIC', 'runtime:self-reference', 'runtime:node-free-selector', 'runtime:selector-list-mixed-reach'],
  routing: [
    { node: 'bare-hover', route: 'STATIC', extracted: [':hover'] },
    { node: 'bare-before', route: 'STATIC', extracted: ['::before'] },
    { node: 'bare-span', route: 'STATIC', extracted: ['span'] },
    { node: 'bare-child', route: 'STATIC', extracted: ['> span'] },
    { node: 'bare-next', route: 'STATIC', extracted: ['+ span'] },
    { node: 'bare-later', route: 'STATIC', extracted: ['~ span'] },
    { node: 'double', route: 'runtime:self-reference', runtime: ['&&'], whole: true },
    { node: 'self-descendant', route: 'runtime:self-reference', runtime: ['& &'], whole: true },
    { node: 'nested-sibling', route: 'runtime:self-reference', runtime: ['&:hover'], whole: true },
    { node: 'not-self', route: 'runtime:node-free-selector', runtime: [':not(&)'], whole: true },
    { node: 'is-self', route: 'runtime:node-free-selector', runtime: [':is(&, .a)'], whole: true },
    { node: 'where-self', route: 'runtime:node-free-selector', runtime: [':where(&, .a)'], whole: true },
    { node: 'html-not', route: 'runtime:node-free-selector', runtime: ['html:not(&) p'], whole: true },
    { node: 'not-self-p', route: 'runtime:node-free-selector', runtime: [':not(&) p'], whole: true },
    { node: 'not-self-list', route: 'runtime:node-free-selector', runtime: [':not(&), .other'], whole: true },
    { node: 'list-other', route: 'runtime:selector-list-mixed-reach', runtime: ['&, .other'], extracted: ['paddingLeft'] },
    { node: 'attr-ancestor', route: 'STATIC', extracted: ['[data-theme="x"] &'] },
    // Emotion's compat attaches a colon-leading key to its parent, so the selector names the node twice.
    { node: 'where-ancestor', route: 'runtime:self-reference', runtime: [':where(.x) &'], whole: true },
  ],
}

export function App(): ReactElement {
  return Div({
    children: [
      Div({ key: 'bare-hover', tabIndex: 0, css: { ':hover': { color: 'rgb(200, 0, 0)' } }, children: Span('bare :hover', { key: 's' }) }),
      Div({ key: 'bare-before', css: { '::before': { content: '"›"', marginRight: 4 } }, children: 'bare ::before' }),
      Div({ key: 'bare-span', css: { span: { fontWeight: 700 } }, children: Span('bare span', { key: 's' }) }),
      Div({
        key: 'bare-child',
        css: { '> span': { fontStyle: 'italic' } },
        children: [Span('child span', { key: 's' }), Div({ key: 'd', children: Span('grandchild span', { key: 'g' }) })],
      }),
      Div({ key: 'bare-next', css: { '+ span': { color: 'rgb(0, 120, 0)' } }, children: 'bare + span' }),
      Span('the span after bare + span', { key: 'after-next' }),
      Div({ key: 'bare-later', css: { '~ span': { textDecoration: 'underline' } }, children: 'bare ~ span' }),
      Span('a later span', { key: 'later-span' }),
      Div({ key: 'double', css: { '&&': { color: 'rgb(0, 0, 200)' } }, children: '&&' }),
      Div({ key: 'self-descendant', color: 'rgb(150, 0, 0)', css: { '& &': { fontStyle: 'italic' } }, children: 'self descendant' }),
      Div({ key: 'nested-sibling', color: 'rgb(0, 0, 0)', css: { '&:hover': { '& + &': { marginTop: 9 } } }, children: 'nested & + &' }),
      Div({ key: 'not-self', css: { ':not(&)': { scrollMarginTop: 3 } }, children: ':not(&)' }),
      // & only inside a list in :is or :where, or only inside :not after a type: each matches elements without the node.
      Div({ key: 'is-self', css: { ':is(&, .a)': { wordSpacing: '2px' } }, children: ':is(&, .a)' }),
      Span('an .a elsewhere', { key: 'is-a', className: 'a' }),
      Div({ key: 'where-self', css: { ':where(&, .a)': { textIndent: '4px' } }, children: ':where(&, .a)' }),
      Div({ key: 'html-not', css: { 'html:not(&) p': { fontVariant: 'small-caps' } }, children: P('html:not(&) p', { key: 'p' }) }),
      P('a paragraph outside the node', { key: 'outside-p' }),
      Div({ key: 'list-other', paddingLeft: 2, css: { '&, .other': { fontWeight: 600 } }, children: "'&, .other'" }),
      Span('an .other elsewhere', { key: 'other-elsewhere', className: 'other' }),
      Div({ key: 'not-self-p', css: { ':not(&) p': { textDecoration: 'line-through' } }, children: P('a p inside the node', { key: 'p' }) }),
      Div({ key: 'beside', children: [P('a styled sibling p', { key: 'a' }), Span('an unstyled sibling span', { key: 'b' })] }),
      Div({
        key: 'not-self-list',
        css: { ':not(&), .other': { textUnderlineOffset: '3px' } },
        children: Span('.other inside', { key: 'o', className: 'other' }),
      }),
      Section({
        key: 'theme-wrap',
        'data-theme': 'x',
        children: Div({ key: 'attr-ancestor', css: { '[data-theme="x"] &': { borderLeft: '2px solid rgb(0, 0, 0)' } }, children: 'attribute ancestor' }),
      }),
      Div({
        key: 'where-wrap',
        className: 'x',
        children: Div({ key: 'where-ancestor', css: { ':where(.x) &': { paddingLeft: 7 } }, children: ':where(.x) &' }),
      }),
    ],
  } as never).render() as ReactElement
}
