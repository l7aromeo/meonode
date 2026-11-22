// Rules from one node reaching another, beyond a pair, for the cross-nodes-*
// cases: two reaching ancestors over a child with and without its own colour;
// a static grandparent over a runtime parent; and a child's .a:has(&) rule
// setting its extracted ancestor's colour against the ancestor's own rule of
// the same specificity. Emotion orders each by render, so the computed
// colours must match extraction off. The tie shapes of parts/ties.ts are
// their own cases.
import type { ReactElement } from 'react'
import { Div, Span } from '@meonode/ui'

/** A rule held in a variable, which keeps its node on the runtime path. */
const reachGreen = { '& > *': { color: 'rgb(0, 160, 0)' } }

/** Every shape, side by side. */
export function CrossNodes(): ReactElement {
  return Div({
    children: [
      // 1. Two reaching ancestors, over a child with its own colour and over one without.
      Div({
        key: 'two-ancestors',
        css: { '& *': { color: 'rgb(200, 0, 0)' } },
        children: [
          Div({ key: 'own', css: { '& > *': { color: 'rgb(0, 160, 0)' } }, children: Span('own blue', { css: { color: 'rgb(0, 0, 200)' } }) }),
          Div({ key: 'none', css: { '& > *': { color: 'rgb(0, 160, 0)' } }, children: Span('no colour of its own') }),
        ],
      }),
      // 2. A static grandparent with a runtime parent, over a child with no colour.
      Div({
        key: 'static-grandparent',
        css: { '& *': { color: 'rgb(200, 0, 0)' } },
        children: Div({ key: 'runtime-middle', css: reachGreen, children: Span('no colour') }),
      }),
      // 3. A later node's rule reaching its ancestor, against the ancestor's own rule of the same specificity.
      Div({
        key: 'has-ancestor',
        className: 'a',
        css: { '&.a': { color: 'rgb(0, 0, 200)' } },
        children: Span('sets its ancestor red', { key: 'has-child', css: { '.a:has(&)': { color: 'rgb(200, 0, 0)' } } }),
      }),
    ],
  } as never).render() as ReactElement
}
