import { Suspense } from 'react'
import { connection } from 'next/server'
import { Node } from '@meonode/ui'
import { tree } from '../tree'

/** The same tree at request time, inside a streamed boundary. */
async function Content() {
  await connection()
  return tree().render()
}

export default function Page() {
  return Node(Suspense, { fallback: null, children: Node(Content) }).render()
}
