'use client'
import { createElement, useId } from 'react'
import { Div, registerStaticCss } from '@meonode/ui'

// Compiled output written by hand in the contract's shape, for a client component.
registerStaticCss('fixture-client', [
  [0, 'mn-00000000cli0a', '.mn-00000000cli0a{color:rgb(0, 0, 255);}'],
  [0, 'mn-00000000cli0w', '.mn-00000000cli0w{width:var(--mv-00000000cli0w);}'],
])

const plain = { __meo$: 2, __meo$s: 'mn-00000000cli0a mn-00000000cli0w', 'data-testid': 'static-client' }
const partial = { __meo$: 2, __meo$s: 'mn-00000000cli0a', __meo$c: { padding: '5px' }, 'data-testid': 'static-client-partial', children: 'partial' }

/** Reads an id, so a change in the tree's shape between server and browser shows. */
function Labelled({ name }: { name: string }) {
  return createElement('label', { htmlFor: useId(), 'data-testid': `static-client-label-${name}` }, 'label')
}

export default function StaticCssClient() {
  return Div({
    children: [
      Div({
        ...plain,
        key: 'fast',
        __meo$v: { '--mv-00000000cli0w': '40px' },
        children: [createElement(Labelled, { key: 'label', name: 'inside' }), Div({ ...partial, key: 'partial' } as never)],
      } as never),
      // After a fast-path subtree, in the client tree.
      createElement(Labelled, { key: 'after', name: 'after' }),
    ],
  }).render()
}
