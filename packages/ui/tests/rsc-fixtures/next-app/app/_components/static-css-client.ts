'use client'
import { createElement, useId } from 'react'
import { Div, registerStaticCss } from '@meonode/ui'
import { compiledProps } from './compiled-props'

// Compiled output written by hand in the contract's shape, for a client component.
registerStaticCss('fixture-client', [
  [1, 'mn-00000000cli1a', '.mn-00000000cli1a{color:rgb(0, 0, 255);}'],
  [1, 'mn-00000000cli1w', '.mn-00000000cli1w{width:var(--mv-00000000cli1w);}'],
])

const plain = compiledProps({ __meo$s: 'mn-00000000cli1a mn-00000000cli1w', 'data-testid': 'static-client' })
const partial = compiledProps({ __meo$s: 'mn-00000000cli1a', __meo$c: { padding: '5px' }, 'data-testid': 'static-client-partial', children: 'partial' })

/**
 * Shows the id `useId` gives it as text, which hydration checks and the browser
 * corrects, unlike an attribute. A slot missing in the browser would shift it:
 * React writes a child's index in as many bits as its siblings' count needs, and
 * the slot takes the root's three children to four, with a fork below each probe.
 */
function Labelled({ name }: { name: string }) {
  return createElement('span', { 'data-testid': `static-client-label-${name}` }, useId())
}

export default function StaticCssClient() {
  return Div({
    children: [
      Div({
        ...plain,
        key: 'fast',
        __meo$v: { '--mv-00000000cli1w': '40px' },
        children: [createElement(Labelled, { key: 'label', name: 'inside' }), Div({ ...partial, key: 'partial' } as never)],
      } as never),
      // After a fast-path subtree, in the client tree.
      createElement('p', { key: 'after' }, createElement(Labelled, { name: 'after' }), 'x'),
      createElement('b', { key: 'b' }, 'b'),
    ],
  }).render()
}
