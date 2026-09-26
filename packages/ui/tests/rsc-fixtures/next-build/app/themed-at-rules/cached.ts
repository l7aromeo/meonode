import type { ReactNode } from 'react'
import { createNode, Div } from '@meonode/ui'
import { THEMED_KEYS } from './tree'

/** A function component inside its own `'use cache'` scope, passing the themed class through. */
async function CachedCard({ className, children }: { className?: string; children?: ReactNode }) {
  'use cache'
  return Div({ className, 'data-case': 'cached', 'data-size': '1000px', children }).render()
}

const CachedCardNode = createNode(CachedCard)

/** `CachedCard` composing the themed class with css of its own. */
async function CachedOwnCard({ className, children }: { className?: string; children?: ReactNode }) {
  'use cache'
  return Div({ className, paddingLeft: '5px', 'data-case': 'cached-composed', 'data-size': '1000px', children }).render()
}

const CachedOwnCardNode = createNode(CachedOwnCard)

/** The cached shapes, for server pages only: a client render cannot hold a cached server component. */
export const cachedShapes = () => [
  CachedCardNode({ key: 'cached', css: THEMED_KEYS, children: 'cached component' }),
  CachedOwnCardNode({ key: 'cached-composed', css: THEMED_KEYS, children: 'cached, composed' }),
]
