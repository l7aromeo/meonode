'use client'

import { lazy } from 'react'
import { Node } from '@meonode/ui'

/**
 * `DelayedArticle` loaded on demand. The server renders it into the HTML; the
 * client fetches its chunk only when hydration reaches it, so holding that chunk
 * back holds this boundary dehydrated while the rest of the page hydrates.
 */
const Delayed = lazy(() => import('./delayed-article').then(module => ({ default: module.DelayedArticle })))

export function LazyArticle() {
  return Node(Delayed).render()
}
