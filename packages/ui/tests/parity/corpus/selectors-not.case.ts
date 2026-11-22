// :not in every position: with a pseudo-class, a class, an attribute, a list,
// a state, chained twice, after a combinator, as an ancestor, around :has, inside
// :is, and nested with :hover either way round. Each selector styles one
// element that matches and one that does not.
import type { ReactElement } from 'react'
import { Div, Em, Img, Input, P, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.not', 'sel.pseudo-class', 'sel.child', 'sel.sibling', 'sel.ancestor', 'sel.where-is-has', 'place.css', 'env.ssr-hydrate'],
  routes: ['STATIC', 'runtime:self-reference'],
  routing: [
    { node: 'last-a', route: 'STATIC', extracted: ['&:not(:last-child)'] },
    { node: 'class-a', route: 'STATIC', extracted: ['&:not(.a)'] },
    { node: 'attr-a', route: 'STATIC', extracted: ['&:not([disabled])'] },
    { node: 'list-a', route: 'STATIC', extracted: ['&:not(.a, .b)'] },
    { node: 'state-a', route: 'STATIC', extracted: ['&:not(:hover)'] },
    { node: 'middle-b', route: 'STATIC', extracted: ['&:not(:first-child):not(:last-child)'] },
    { node: 'child-not', route: 'STATIC', extracted: ['& > :not(span)'] },
    { node: 'not-then-p', route: 'STATIC', extracted: ['& :not(p) + p'] },
    // Emotion's compat attaches a colon-leading key to its parent, so the selector names the node twice.
    { node: 'ancestor-not', route: 'runtime:self-reference', runtime: [':not(.x) &'], whole: true },
    { node: 'has-a', route: 'STATIC', extracted: ['&:not(:has(img))'] },
    { node: 'is-a', route: 'STATIC', extracted: ['&:is(:not(.a))'] },
    { node: 'not-hover', route: 'STATIC', extracted: ['&:not(.a)'] },
    { node: 'hover-not', route: 'STATIC', extracted: ['&:hover'] },
  ],
}

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='

export function App(): ReactElement {
  return Div({
    children: [
      Div({
        key: 'last',
        children: [
          Span('matches', { key: 'last-a', css: { '&:not(:last-child)': { color: 'rgb(200, 0, 0)' } } }),
          Span('last, does not', { key: 'last-b', css: { '&:not(:last-child)': { color: 'rgb(200, 0, 0)' } } }),
        ],
      }),
      Div({
        key: 'class',
        children: [
          Span('no .a, matches', { key: 'class-a', css: { '&:not(.a)': { fontWeight: 700 } } }),
          Span('.a, does not', { key: 'class-b', className: 'a', css: { '&:not(.a)': { fontWeight: 700 } } }),
        ],
      }),
      Div({
        key: 'attr',
        children: [
          Input({ key: 'attr-a', defaultValue: 'enabled, matches', css: { '&:not([disabled])': { borderColor: 'rgb(0, 150, 0)' } } }),
          Input({ key: 'attr-b', disabled: true, defaultValue: 'disabled, does not', css: { '&:not([disabled])': { borderColor: 'rgb(0, 150, 0)' } } }),
        ],
      }),
      Div({
        key: 'list',
        children: [
          Span('.c, matches', { key: 'list-a', className: 'c', css: { '&:not(.a, .b)': { textDecoration: 'underline' } } }),
          Span('.b, does not', { key: 'list-b', className: 'b', css: { '&:not(.a, .b)': { textDecoration: 'underline' } } }),
        ],
      }),
      Div({
        key: 'state',
        children: [
          Span('not hovered, matches', { key: 'state-a', css: { '&:not(:hover)': { color: 'rgb(0, 0, 200)' } } }),
          Span('also', { key: 'state-b', css: { '&:not(:hover)': { color: 'rgb(0, 0, 200)' } } }),
        ],
      }),
      Div({
        key: 'middle',
        children: [
          Span('first', { key: 'middle-a', css: { '&:not(:first-child):not(:last-child)': { fontStyle: 'italic' } } }),
          Span('middle, matches', { key: 'middle-b', css: { '&:not(:first-child):not(:last-child)': { fontStyle: 'italic' } } }),
          Span('last', { key: 'middle-c', css: { '&:not(:first-child):not(:last-child)': { fontStyle: 'italic' } } }),
        ],
      }),
      Div({
        key: 'child-not',
        css: { '& > :not(span)': { color: 'rgb(130, 0, 130)' } },
        children: [Span('span, does not', { key: 's' }), Em('em, matches', { key: 'e' })],
      }),
      Div({
        key: 'not-then-p',
        css: { '& :not(p) + p': { color: 'rgb(0, 120, 120)' } },
        children: [Em('em', { key: 'e' }), P('after a non-p, matches', { key: 'p1' }), P('after a p, does not', { key: 'p2' })],
      }),
      Div({ key: 'x-wrap', className: 'x', children: Span('ancestor form', { key: 'ancestor-not', css: { ':not(.x) &': { letterSpacing: 1 } } }) }),
      Div({
        key: 'has',
        children: [
          Div({ key: 'has-a', css: { '&:not(:has(img))': { borderLeft: '3px solid rgb(0, 0, 0)' } }, children: 'no image, matches' }),
          Div({ key: 'has-b', css: { '&:not(:has(img))': { borderLeft: '3px solid rgb(0, 0, 0)' } }, children: Img({ key: 'i', src: PIXEL, alt: '' }) }),
        ],
      }),
      Div({
        key: 'is',
        children: [
          Span('no .a, matches', { key: 'is-a', css: { '&:is(:not(.a))': { color: 'rgb(150, 75, 0)' } } }),
          Span('.a, does not', { key: 'is-b', className: 'a', css: { '&:is(:not(.a))': { color: 'rgb(150, 75, 0)' } } }),
        ],
      }),
      Span('not .a, then hover', { key: 'not-hover', css: { '&:not(.a)': { '&:hover': { color: 'rgb(220, 0, 0)' } } } }),
      Span('hover, then not .a', { key: 'hover-not', css: { '&:hover': { '&:not(.a)': { color: 'rgb(0, 160, 0)' } } } }),
    ],
  } as never).render() as ReactElement
}
