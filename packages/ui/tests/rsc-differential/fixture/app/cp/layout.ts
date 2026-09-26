import type { ReactNode } from 'react'
import { Node } from '@meonode/ui'
import { Providers } from '../_shared/providers'

// ThemeProvider inside a 'use client' component: the usual setup.
export default function Layout({ children }: { children: ReactNode }) {
  return Node(Providers, { children }).render()
}
