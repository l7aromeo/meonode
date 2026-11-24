'use client'
import { createElement, useId } from 'react'
import { Div, registerStaticTemplate } from '@meonode/ui'
import { compiledProps } from './compiled-props'

// Compiled output written by hand in the contract's shape, for a client
// component: a template of its whole style, filled with the call site's value.
registerStaticTemplate('fxcli1', ['color:rgb(0, 0, 255);width:', ';'])

const plain = compiledProps({ 'data-testid': 'static-client' })
// A node with css on the runtime path, inside the named one.
const partial = compiledProps({ __meo$c: { color: 'rgb(0, 0, 255)', padding: '5px' }, 'data-testid': 'static-client-partial', children: 'partial' })

/**
 * Shows the id `useId` gives it as text, which hydration checks and the browser
 * corrects, unlike an attribute. A fiber the browser added or dropped would shift
 * it: React writes a child's index in as many bits as its siblings' count needs.
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
        __meo$t: ['fxcli1', '40px'],
        children: [createElement(Labelled, { key: 'label', name: 'inside' }), Div({ ...partial, key: 'partial' } as never)],
      } as never),
      // After a named subtree, in the client tree.
      createElement('p', { key: 'after' }, createElement(Labelled, { name: 'after' }), 'x'),
      createElement('b', { key: 'b' }, 'b'),
    ],
  }).render()
}
