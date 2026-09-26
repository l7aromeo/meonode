import { Suspense } from 'react'
import { connection } from 'next/server'
import { Node } from '@meonode/ui'
import { themedTree } from '../tree'
import { cachedShape } from '../cached'

/** `/themed-at-rules` rendered at request time, inside a streamed boundary. */
async function Content() {
  await connection()
  return themedTree([cachedShape()])
}

export default function Page() {
  return Node(Suspense, { fallback: null, children: Node(Content) }).render()
}
