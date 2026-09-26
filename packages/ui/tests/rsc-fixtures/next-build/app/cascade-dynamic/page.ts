import { Suspense } from 'react'
import { connection } from 'next/server'
import { Node } from '@meonode/ui'
import { CardNode } from '../_shared/card'
import { later } from '../_shared/late'

/** The cascade case at request time, inside a streamed boundary. */
async function Content() {
  await connection()
  await later()
  return CardNode({ css: { color: 'rgb(255, 165, 0)' }, children: 'conflict' }).render()
}

export default function Page() {
  return Node(Suspense, { fallback: null, children: Node(Content) }).render()
}
