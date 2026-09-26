import { createElement, type ReactNode } from 'react'
import { createNode, Div, Node } from '@meonode/ui'
import { later } from '../_shared/late'

function ServerDiv(props: { children?: ReactNode; className?: string }) {
  return createElement('div', props)
}
const WrappedDiv = createNode(ServerDiv)

/**
 * A server-component factory given an array `css` — the shape a non-map `css`
 * resolves to before it is compiled — with the compile pinned after the
 * registry's drain (see `later`).
 */
async function Rows() {
  'use cache'
  await later()
  return Div({
    children: [
      WrappedDiv({ key: 1, css: [{ color: '#3a0ca3' }, { padding: '3px' }], children: 'array one' }),
      WrappedDiv({ key: 2, css: [{ color: '#4361ee' }, { margin: '1px' }], children: 'array two' }),
    ],
  }).render()
}

export default function Page() {
  return Node(Rows).render()
}
