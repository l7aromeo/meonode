import { createElement, Suspense } from 'react'
import { Div, Node, registerStaticCss, Span } from '@meonode/ui'
import StaticCssClient from '../_components/static-css-client'
import { IdProbe } from '../_components/hoc-client'
import { compiledProps } from '../_components/compiled-props'

// Compiled output written by hand in the contract's shape, for a server
// component: each node's whole style under its name, registered by its module.
// The props sit in constants, so a compiled run of this suite leaves the call
// sites as they are.
registerStaticCss('fixture-server', [['fxsrv1', 'color:rgb(255, 0, 0);@media (min-width: 1px){padding-left:7px;}']])
registerStaticCss('fixture-late', [['fxlate1', 'margin-top:3px;&:hover{color:rgb(0, 128, 0);}']])

const plain = compiledProps({ __meo$n: 'fxsrv1', 'data-testid': 'static-server', children: 'server' })
// A node with css on the runtime path, beside the named ones.
const partial = compiledProps({ __meo$c: { color: 'rgb(255, 0, 0)', padding: '4px' }, 'data-testid': 'static-server-partial', children: 'partial' })
const late = compiledProps({ __meo$n: 'fxlate1', 'data-testid': 'static-late' })

/** Streams in after the shell, so its named style reaches the page in a later chunk. */
async function Late() {
  await new Promise(resolve => setTimeout(resolve, 150))
  return Span('late', { ...late } as never).render()
}

export default function Page() {
  return Div({
    'data-testid': 'static-css-page',
    children: [
      Div({ ...plain, key: 'plain' } as never),
      // `useId` inside and after a named subtree, in the server tree.
      Div({ ...plain, 'data-testid': 'static-server-holder', key: 'holder', children: Node(IdProbe, { name: 'static-inside-server' }) } as never),
      Node(IdProbe, { key: 'after', name: 'static-after-server' }),
      Div({ ...partial, key: 'partial' } as never),
      Node(StaticCssClient, { key: 'client' }),
      createElement(Suspense, { key: 'late', fallback: null }, createElement(Late)),
    ],
  }).render()
}
