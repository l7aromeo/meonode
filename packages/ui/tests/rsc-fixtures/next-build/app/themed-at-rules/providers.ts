'use client'

import type { ReactNode } from 'react'
import { ThemeProvider } from '@meonode/ui'

/** The theme provided from a client component, as an app whose root layout stays a server component does. */
export function Providers({ children }: { children: ReactNode }) {
  return ThemeProvider({
    tokens: { breakpoint: { wide: '1000px' } },
    modes: ['light'],
    defaultMode: 'light',
    children,
  }).render()
}
