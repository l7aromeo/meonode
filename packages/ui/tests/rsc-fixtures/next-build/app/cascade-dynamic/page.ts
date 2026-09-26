import { Suspense } from 'react'
import { connection } from 'next/server'
import { Node } from '@meonode/ui'
import { CALLER, CardNode } from '../_shared/card'
import { later } from '../_shared/late'

/** The cascade case at request time, inside a streamed boundary. */
async function Content() {
  await connection()
  await later()
  return CardNode({ css: CALLER, children: 'conflict' }).render()
}

export default function Page() {
  return Node(Suspense, { fallback: null, children: Node(Content) }).render()
}
