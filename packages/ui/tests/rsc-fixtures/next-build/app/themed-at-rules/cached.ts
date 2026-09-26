import type { ReactNode } from 'react'
import { createNode, Div } from '@meonode/ui'
import { THEMED_KEYS } from './tree'

/** A function component inside its own `'use cache'` scope, handed the themed class. */
async function CachedCard({ className, children }: { className?: string; children?: ReactNode }) {
  'use cache'
  return Div({ className, 'data-case': 'cached', 'data-size': '1000px', children }).render()
}

const CachedCardNode = createNode(CachedCard)

/** The cached shape, for server pages only: a client render cannot hold a cached server component. */
export const cachedShape = () => CachedCardNode({ key: 'cached', css: THEMED_KEYS, children: 'cached component' })
