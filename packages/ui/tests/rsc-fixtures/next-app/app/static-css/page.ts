import { createElement, Suspense } from 'react'
import { Div, Node, registerStaticCss, Span } from '@meonode/ui'
import StaticCssClient from '../_components/static-css-client'
import { IdProbe } from '../_components/hoc-client'
import { compiledProps } from '../_components/compiled-props'

// Compiled output written by hand in the contract's shape, for a server
// component. The props sit in constants, so a compiled run of this suite leaves
// the call sites as they are.
registerStaticCss('fixture-server', [
  [1, 'mn-00000000srv1a', '.mn-00000000srv1a{color:rgb(255, 0, 0);}'],
  [3, 'mn-00000000srv3m', '@media (min-width: 1px){.mn-00000000srv3m{padding-left:7px;}}'],
])
registerStaticCss('fixture-late', [
  [1, 'mn-0000000late1a', '.mn-0000000late1a{margin-top:3px;}'],
  [2, 'mn-0000000late2h', '.mn-0000000late2h:hover{color:rgb(0, 128, 0);}'],
])

const plain = compiledProps({ __meo$s: 'mn-00000000srv1a mn-00000000srv3m', 'data-testid': 'static-server', children: 'server' })
const partial = compiledProps({ __meo$s: 'mn-00000000srv1a', __meo$c: { padding: '4px' }, 'data-testid': 'static-server-partial', children: 'partial' })
const late = compiledProps({ __meo$s: 'mn-0000000late1a mn-0000000late2h', 'data-testid': 'static-late' })

/** Streams in after the shell, so its static css reaches the page in a later chunk. */
async function Late() {
  await new Promise(resolve => setTimeout(resolve, 150))
  return Span('late', { ...late } as never).render()
}

export default function Page() {
  return Div({
    'data-testid': 'static-css-page',
    children: [
      Div({ ...plain, key: 'plain' } as never),
      // `useId` inside and after a fast-path subtree, in the server tree.
      Div({ ...plain, 'data-testid': 'static-server-holder', key: 'holder', children: Node(IdProbe, { name: 'static-inside-server' }) } as never),
      Node(IdProbe, { key: 'after', name: 'static-after-server' }),
      Div({ ...partial, key: 'partial' } as never),
      Node(StaticCssClient, { key: 'client' }),
      createElement(Suspense, { key: 'late', fallback: null }, createElement(Late)),
    ],
  }).render()
}
