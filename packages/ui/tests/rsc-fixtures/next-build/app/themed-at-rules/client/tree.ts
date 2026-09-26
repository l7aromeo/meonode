'use client'

import { themedTree } from '../tree'

/** The same tree rendered by a client component, where the theme is read from context. */
export function ClientTree() {
  return themedTree()
}
