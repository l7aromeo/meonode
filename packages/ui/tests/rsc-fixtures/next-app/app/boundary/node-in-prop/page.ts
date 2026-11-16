import { Div, Node, Span, Suspense } from '@meonode/ui'
import { createElement, type ReactNode } from 'react'
import ClientSlot from '../../_components/client-slot'

// A node handed to a prop that the receiving component renders as a React node:
// a server component's slot, a client component's slot (so the node crosses the
// Flight boundary as a prop), and a Suspense fallback.

function ServerSlot({ slot }: { slot?: ReactNode }) {
  return createElement('section', { 'data-testid': 'server-slot' }, slot)
}

/** Resolves after the shell has streamed, so the fallback is sent first. */
async function Later() {
  await new Promise(resolve => setTimeout(resolve, 300))
  return Span('suspended-content', { 'data-testid': 'suspended' }).render()
}

export default function Page() {
  return Div({
    'data-testid': 'node-in-prop-page',
    children: [
      Node(ServerSlot, { key: 'server', slot: Span('server-slot-content', { 'data-testid': 'server-slot-span', color: 'red' }) }),
      Node(ClientSlot, { key: 'client', slot: Span('client-slot-content', { 'data-testid': 'client-slot-span', color: 'red' }) }),
      Suspense({ key: 'suspense', fallback: Div({ 'data-testid': 'fallback', children: 'fallback-content' }), children: Node(Later) }),
    ],
  }).render()
}
