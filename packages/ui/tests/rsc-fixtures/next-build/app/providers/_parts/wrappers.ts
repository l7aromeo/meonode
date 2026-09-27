'use client'

import type { ReactNode } from 'react'
import { Node, PortalHost, PortalProvider, ThemeProvider } from '@meonode/ui'
import { PortalProbe, ThemeProbe } from './probes'
import { THEME } from './theme'

/** `ThemeProvider` rendered from a client component, with a probe below it. */
export function ClientThemed({ children }: { children?: ReactNode }) {
  return ThemeProvider({ ...THEME, children: [Node(ThemeProbe, { key: 'probe' }), children] }).render()
}

/** `PortalProvider` rendered from a client component, with a probe and the host below it. */
export function ClientPortal({ children }: { children?: ReactNode }) {
  return PortalProvider({ children: [Node(PortalProbe, { key: 'probe' }), children, PortalHost({ key: 'host' })] }).render()
}
