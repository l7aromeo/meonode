import { Suspense } from 'react'
import { connection } from 'next/server'
import { Div, Node } from '@meonode/ui'
import { Article } from './article'
import { LazyArticle } from './lazy-article'

const fallback = () => Div({ 'data-testid': 'fallback', children: 'loading' }).render()

/** Content that streams in 1.5 s after the shell. */
async function Slow() {
  await connection()
  await new Promise(resolve => setTimeout(resolve, 1500))
  return Node(Article, { label: 'streamed' }).render()
}

/** A boundary whose content streams in after the shell has hydrated. */
export const streamedPage = () => Node(Suspense, { fallback: fallback(), children: Node(Slow) }).render()

/** A boundary whose content is in the server HTML but whose component's chunk loads on demand. */
export const chunkPage = () => Node(Suspense, { fallback: fallback(), children: Node(LazyArticle) }).render()
