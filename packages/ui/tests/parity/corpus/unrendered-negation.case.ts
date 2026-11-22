// A page that imports a module of nodes whose selectors can match without the
// node, and never renders them. With Emotion their rules exist only once the
// nodes render, so nothing on this page may be styled by them. Server-rendered;
// unrendered-negation-client loads it as a client navigation.
import type { ReactElement } from 'react'
import { Div, P } from '@meonode/ui'
import { Unrendered } from './parts/negation-hidden.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.not', 'sel.where-is-has', 'sel.comma', 'place.css', 'env.ssr-hydrate'],
  routes: ['STATIC', 'runtime:node-free-selector', 'runtime:self-reference', 'runtime:selector-list-mixed-reach'],
  routing: [
    { node: 'not-self', route: 'runtime:node-free-selector', runtime: [':not(&)'], whole: true },
    { node: 'is-self', route: 'runtime:node-free-selector', runtime: [':is(&, .x)'], whole: true },
    { node: 'where-self', route: 'runtime:node-free-selector', runtime: [':where(&, .x)'], whole: true },
    { node: 'other', route: 'runtime:selector-list-mixed-reach', runtime: ['&, .other'], extracted: ['paddingLeft'] },
    // Emotion's compat attaches a colon-leading key to its parent, so the selector names the node twice.
    { node: 'has-self', route: 'runtime:self-reference', runtime: [':has(&)'], whole: true },
  ],
}

/** Imported so its module is in the page, never rendered. */
export const notRendered = Unrendered

export function App(): ReactElement {
  return Div({
    children: [P('the page', { key: 'p' }), P('an .x paragraph', { key: 'x', className: 'x' }), P('an .other paragraph', { key: 'o', className: 'other' })],
  } as never).render() as ReactElement
}
