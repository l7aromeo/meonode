import { Suspense } from 'react'
import { connection } from 'next/server'
import { Node } from '@meonode/ui'
import { CALLER, CachedCardNode } from '../_shared/card'

/**
 * The cascade case with the component inside its own `'use cache'` scope and
 * the caller outside it, rendered at request time.
 */
async function Content() {
  await connection()
  return CachedCardNode({ css: CALLER, children: 'conflict' }).render()
}

export default function Page() {
  return Node(Suspense, { fallback: null, children: Node(Content) }).render()
}
