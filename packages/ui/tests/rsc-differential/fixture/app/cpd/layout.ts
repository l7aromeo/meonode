import { Suspense, type ReactNode } from 'react'
import { Node } from '@meonode/ui'
import { Providers } from '../_shared/providers'

// Same as `cp`, but every page awaits `connection()`, so it renders per request
// and streams instead of being prerendered.
export default function Layout({ children }: { children: ReactNode }) {
  return Node(Providers, { children: Node(Suspense, { fallback: null, children }) }).render()
}
