import type { ReactNode } from 'react'
import { Node } from '@meonode/ui'
import { Providers } from './providers'

/** Below the root layout's `StyleRegistry`, as a root layout mounting both would order them. */
export default function ThemedLayout({ children }: { children: ReactNode }) {
  return Node(Providers, { children }).render()
}
