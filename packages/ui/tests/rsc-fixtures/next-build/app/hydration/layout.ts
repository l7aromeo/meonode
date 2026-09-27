import type { ReactNode } from 'react'
import { Node, ThemeProvider } from '@meonode/ui'
import { ModeProbe } from './_parts/mode-probe'

/** `ThemeProvider` above every page here, rendered from a server layout as an application root does, with a mode reader beside the page. */
export default function HydrationLayout({ children }: { children: ReactNode }) {
  return ThemeProvider({
    tokens: { base: { default: 'var(--base-default)' } },
    modes: ['light', 'dark'],
    defaultMode: 'light',
    children: [Node(ModeProbe, { key: 'mode' }), children],
  }).render()
}
