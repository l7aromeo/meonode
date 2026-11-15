import { Suspense } from 'react'
import { connection } from 'next/server'
import { Node, Span } from '@meonode/ui'
import Probe from './probe'

// Rendered per request, so `next start` renders the probe itself rather than
// serving what `next build` prerendered.
async function AtRequest() {
  await connection()
  return Node(Probe).render()
}

export default function Page() {
  return Node(Suspense, { fallback: Span('loading').render(), children: Node(AtRequest) }).render()
}
