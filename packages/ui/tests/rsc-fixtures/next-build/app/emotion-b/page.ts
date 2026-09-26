import { Suspense } from 'react'
import { connection } from 'next/server'
import { Div, Node } from '@meonode/ui'

/**
 * Request-time rules that go through the registry's emotion cache — an
 * intrinsic node, rendered by `StyledRenderer` — rather than the server-compile
 * path. Paired with `/emotion-a` under concurrent requests: a
 * flushed-id set shared between renders would make one response emit nothing.
 */
async function Content() {
  await connection()
  return Div({
    children: [
      Div({ key: 1, color: '#842029', padding: 4, children: 'emotion b one' }),
      Div({ key: 2, color: '#055160', padding: 4, children: 'emotion b two' }),
    ],
  }).render()
}

export default function Page() {
  return Node(Suspense, { fallback: null, children: Node(Content) }).render()
}
