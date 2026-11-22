// Prefixed and escaped selectors (::placeholder, :read-only, :read-write,
// ::selection, an escaped class), which extract with Emotion's prefixed copies
// written before the rule, the same property in two contexts of equal
// specificity on one node (&.active and :hover, in both source orders, with
// both active once hover is forced; a pseudo context against a per-node block),
// and rules across nodes: a parent's &:hover .child over the child's own
// colour, and .parent:hover & on the child.
import { useState, type ReactElement } from 'react'
import { Div, Input, Span, Textarea } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.pseudo-class', 'sel.pseudo-element', 'sel.self-class', 'sel.self-attr', 'sel.ancestor', 'sel.descendant', 'place.css', 'env.ssr-hydrate'],
  routes: ['STATIC', 'runtime:multi-context', 'runtime:selector-block-mixed'],
  routing: [
    { node: 'placeholder', route: 'STATIC', extracted: ['&::placeholder'] },
    { node: 'read-only', route: 'STATIC', extracted: ['&:read-only'] },
    { node: 'read-write', route: 'STATIC', extracted: ['&:read-write'] },
    { node: 'selection', route: 'STATIC', extracted: ['&::selection'] },
    { node: 'escaped', route: 'STATIC', extracted: ['&.a\\:b'] },
    { node: 'class-then-hover', route: 'runtime:multi-context', runtime: ['&.active', '&:hover'] },
    { node: 'hover-then-class', route: 'runtime:multi-context', runtime: ['&:hover', '&.active'] },
    { node: 'base-and-hover', route: 'STATIC', extracted: ['color', '&:hover'] },
    { node: 'pseudo-and-block', route: 'runtime:selector-block-mixed', runtime: ['&:hover', '&[data-on]'] },
    { node: 'pseudo-and-block-apart', route: 'STATIC', extracted: ['&:hover', '&[data-on]'] },
    { node: 'parent-hover', route: 'STATIC', extracted: ['&:hover .child'] },
    { node: 'child', route: 'STATIC', extracted: ['color'] },
    { node: 'child-of-parent', route: 'STATIC', extracted: ['color', '.parent:hover &'] },
  ],
}

export function App(): ReactElement {
  const [open] = useState(true)
  return Div({
    children: [
      Input({ key: 'placeholder', placeholder: 'placeholder', css: { '&::placeholder': { color: 'rgb(150, 0, 150)' } } }),
      Input({ key: 'read-only', readOnly: true, defaultValue: 'read only', css: { '&:read-only': { backgroundColor: 'rgb(235, 235, 235)' } } }),
      Textarea({ key: 'read-write', defaultValue: 'read write', css: { '&:read-write': { borderColor: 'rgb(0, 0, 200)' } } }),
      Div({ key: 'selection', css: { '&::selection': { backgroundColor: 'rgb(255, 230, 0)' } }, children: 'selection colour' }),
      Div({ key: 'escaped', className: 'a:b', css: { '&.a\\:b': { fontWeight: 700 } }, children: 'escaped class' }),
      Div({
        key: 'class-then-hover',
        className: 'active',
        tabIndex: 0,
        css: { '&.active': { color: 'rgb(200, 0, 0)' }, '&:hover': { color: 'rgb(0, 0, 200)' } },
        children: '.active, then :hover',
      }),
      Div({
        key: 'hover-then-class',
        className: 'active',
        tabIndex: 0,
        css: { '&:hover': { color: 'rgb(0, 0, 200)' }, '&.active': { color: 'rgb(200, 0, 0)' } },
        children: ':hover, then .active',
      }),
      Div({ key: 'base-and-hover', color: 'rgb(0, 0, 0)', css: { '&:hover': { color: 'rgb(0, 130, 0)' } }, children: 'base, then :hover' }),
      Div({
        key: 'pseudo-and-block',
        'data-on': '',
        css: { '&:hover': { color: 'rgb(0, 0, 200)' }, '&[data-on]': { color: 'rgb(200, 0, 0)' } },
        children: 'pseudo and block, same property',
      }),
      Div({
        key: 'pseudo-and-block-apart',
        'data-on': '',
        css: { '&:hover': { color: 'rgb(0, 0, 200)' }, '&[data-on]': { backgroundColor: 'rgb(240, 240, 255)' } },
        children: 'pseudo and block, other properties',
      }),
      Div({
        key: 'parent-hover',
        css: { '&:hover .child': { color: 'rgb(200, 0, 0)' } },
        children: Span('child', { key: 'child', className: 'child', color: 'rgb(0, 0, 200)' }),
      }),
      Div({
        key: 'parent',
        className: 'parent',
        children: Span('child of .parent', { key: 'child-of-parent', color: 'rgb(0, 0, 0)', css: { '.parent:hover &': { color: 'rgb(0, 140, 0)' } } }),
      }),
      // A selected-state ancestor block against the element's own hover, same property, both source orders.
      // These pairs carry no routing claim: either route is right as long as the rendered result matches.
      Div({
        key: 'selected',
        className: 'Mui-selected',
        children: [
          Div({
            key: 'selected-then-hover',
            css: { '.Mui-selected &': { color: 'rgb(200, 0, 0)' }, '&:hover': { color: 'rgb(0, 0, 200)' } },
            children: 'selected, then hover',
          }),
          Div({
            key: 'hover-then-selected',
            css: { '&:hover': { color: 'rgb(0, 0, 200)' }, '.Mui-selected &': { color: 'rgb(200, 0, 0)' } },
            children: 'hover, then selected',
          }),
        ],
      }),
      // A runtime value in a class block against a static hover on the same property, both source orders.
      Div({
        key: 'runtime-active-then-hover',
        className: 'active',
        css: { '&.active': { color: open ? 'rgb(150, 0, 0)' : 'rgb(0, 150, 0)' }, '&:hover': { color: 'rgb(255, 0, 0)' } },
        children: 'runtime .active, then hover',
      }),
      Div({
        key: 'hover-then-runtime-active',
        className: 'active',
        css: { '&:hover': { color: 'rgb(255, 0, 0)' }, '&.active': { color: open ? 'rgb(150, 0, 0)' : 'rgb(0, 150, 0)' } },
        children: 'hover, then runtime .active',
      }),
    ],
  } as never).render() as ReactElement
}
