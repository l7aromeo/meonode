import { Suspense } from 'react'
import { connection } from 'next/server'
import { createNode, Div, Node } from '@meonode/ui'

/** The component inside its own `'use cache'` scope, handed a class by each request. */
async function CachedCard({ className, children }: { className?: string; children?: string }) {
  'use cache'
  return Div({ className, 'data-testid': 'conflict', color: 'rgb(0, 128, 128)', children }).render()
}

const CachedCardNode = createNode(CachedCard)

/** Each request's caller colour comes from `?c=`, so interleaved requests hand the same component different classes. */
async function Content({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await connection()
  const { c = 'rgb(255, 165, 0)' } = await searchParams
  return CachedCardNode({ css: { color: c }, children: c }).render()
}

export default function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  return Node(Suspense, { fallback: null, children: Node(Content, { searchParams }) }).render()
}
