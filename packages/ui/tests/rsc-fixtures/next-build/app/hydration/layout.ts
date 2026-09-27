import type { ReactNode } from 'react'
import { ThemeProvider } from '@meonode/ui'

/** `ThemeProvider` above every page here, rendered from a server layout as an application root does. */
export default function HydrationLayout({ children }: { children: ReactNode }) {
  return ThemeProvider({
    tokens: { base: { default: 'var(--base-default)' } },
    modes: ['light', 'dark'],
    defaultMode: 'light',
    children,
  }).render()
}
