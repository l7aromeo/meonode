'use client'

import { Article } from './article'

/** Held back by the test: its chunk is recognised by this marker and delayed. */
export const CHUNK_MARKER = '__meonode_delayed_hydration_chunk__'

/** `Article` from a module of its own, so its client chunk can be delayed on its own. */
export function DelayedArticle() {
  return Article({ label: CHUNK_MARKER })
}
