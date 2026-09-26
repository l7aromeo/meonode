import { Suspense } from 'react'
import { connection } from 'next/server'
import { Node } from '@meonode/ui'
import { TwoRulesB } from '../_shared/registry-nodes'

/**
 * Request-time rules that reach the page only through the registry's emotion
 * cache. Paired with `/emotion-a` under concurrent requests: a flushed-id set
 * shared between renders would make one response emit nothing.
 */
async function Content() {
  await connection()
  return Node(TwoRulesB).render()
}

export default function Page() {
  return Node(Suspense, { fallback: null, children: Node(Content) }).render()
}
