// @layer rules MeoNode leaves to the runtime path, against each other, against
// extracted rules and against a page's own layers (the layers-* cases):
// L1 an outer node's layered descendant rule tied with the inner node's own
// layered colour, in both orders of first appearance; L2 a layered rule and a
// layered rule under a child selector on one node; L3 the page's `base` layer
// against an extracted unlayered padding and a runtime layered padding, under
// the default cache and under a prepended one. The page CSS is LAYERS_PAGE_CSS.
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { useState, type ReactElement } from 'react'
import { Button, Div, I, Node, Span } from '@meonode/ui'

/** The page's own stylesheet: a layer order statement, then a rule in the later layer. */
export const LAYERS_PAGE_CSS = '@layer reset, base; @layer base { .card { padding: 0; border: 1px solid rgb(0, 0, 0) } }'

/** The click that adds L1's outer rule after the inner node has rendered. */
export const ADD_OUTER_LAYER = '[data-act="add-layer"]'

const prepended = createCache({ key: 'pre', prepend: true })

function L1Inner(): ReactElement {
  return Span('L1 inner first', { key: 'l1-inner-first', className: 't', css: { '@layer b': { color: 'rgb(11, 0, 0)' } } }).render() as ReactElement
}

/** L1 with the inner node's layer appearing first, the outer's added by a later commit. */
function L1Reversed(): ReactElement {
  const [added, setAdded] = useState(false)
  return Div({
    children: [
      Button('add layer a', { key: 'add', type: 'button', 'data-act': 'add-layer', onClick: () => setAdded(true) }),
      Div({
        key: 'l1-outer-later',
        className: 'o',
        css: added ? { '@layer a': { '& .t': { color: 'rgb(10, 0, 0)' } } } : {},
        children: Node(L1Inner, { key: 'inner' }),
      }),
    ],
  } as never).render() as ReactElement
}

/** L3: a host of class `card` with an extracted padding and one with a runtime layered padding. */
function L3Cards({ which }: { which: string }): ReactElement {
  return Div({
    children: [
      Div({ key: 'l3-extracted', className: 'card', padding: 16, children: `L3 extracted ${which}` }),
      Div({ key: 'l3-layered', className: 'card', css: { '@layer base': { '&.card': { padding: 4 } } }, children: `L3 layered ${which}` }),
    ],
  } as never).render() as ReactElement
}

/** Every layer shape, side by side. */
export function Layers(): ReactElement {
  return Div({
    children: [
      Div({
        key: 'l1-outer',
        className: 'o',
        css: { '@layer a': { '& .t': { color: 'rgb(10, 0, 0)' } } },
        children: Span('L1 inner', { key: 'l1-inner', className: 't', css: { '@layer b': { color: 'rgb(11, 0, 0)' } } }),
      }),
      Node(L1Reversed, { key: 'l1-reversed' }),
      Div({
        key: 'l2',
        css: { '@layer x': { color: 'rgb(12, 0, 0)' }, '& > i': { '@layer y': { color: 'rgb(13, 0, 0)' } } },
        children: I('L2 i', { key: 'i' }),
      }),
      Node(L3Cards, { key: 'l3-default', which: 'default' }),
      Node(CacheProvider, { key: 'l3-prepend', value: prepended, children: Node(L3Cards, { which: 'prepended' }) }),
    ],
  } as never).render() as ReactElement
}
