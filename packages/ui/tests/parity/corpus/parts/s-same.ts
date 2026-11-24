// Cross-node ties at equal specificity, every node in this one module (s-same-*
// cases): S1 a sibling combinator from the outer walk onto a component's root,
// S2 an outer ancestor rule against a nested component's own rule, S3 a
// parent's & > * against the child's own colour (plain and under @media), and
// & .child against the child's :hover.
import { createElement, type ReactElement } from 'react'
import { Div, Node, Span } from '@meonode/ui'

function S1Item(): ReactElement {
  return Div({ className: 'item', css: { '.wrapper &': { color: 'rgb(2, 0, 0)' } }, children: 'S1 item' }).render() as ReactElement
}

function S2Child(): ReactElement {
  return Span('S2 child', { className: 'child', css: { '.wrapper &': { color: 'rgb(4, 0, 0)' } } }).render() as ReactElement
}

/** The three shapes, side by side. */
export function Shapes(): ReactElement {
  return Div({
    children: [
      Div({
        key: 's1',
        className: 'wrapper',
        children: [Span('S1 before', { key: 'p', css: { '& + .item': { color: 'rgb(1, 0, 0)' } } }), Node(S1Item, { key: 'c' })],
      }),
      Div({ key: 's2', className: 'wrapper', css: { '& .child': { color: 'rgb(3, 0, 0)' } }, children: Node(S2Child) }),
      Div({ key: 's3', css: { '& > *': { color: 'rgb(5, 0, 0)' } }, children: Span('S3 child', { color: 'rgb(6, 0, 0)' }) }),
      Div({
        key: 's3-media',
        css: { '& > *': { color: 'rgb(9, 0, 0)' } },
        children: Span('S3 media child', { css: { '@media (min-width: 1px)': { color: 'rgb(10, 0, 0)' } } }),
      }),
      Div({
        key: 's3-hover',
        css: { '& .child': { color: 'rgb(7, 0, 0)' } },
        children: Span('S3 hover child', { className: 'child', css: { '&:hover': { color: 'rgb(8, 0, 0)' } } }),
      }),
      createElement('hr', { key: 'end' }),
    ],
  } as never).render() as ReactElement
}
