'use client'

import { useEffect } from 'react'
import { Div, Output, usePortal, useTheme } from '@meonode/ui'

/** Reports the mode `useTheme` sees, or `no-provider` when it finds none. */
export function ThemeProbe() {
  let mode: string
  try {
    mode = useTheme().mode
  } catch {
    mode = 'no-provider'
  }
  return Output({ 'data-theme-probe': mode, children: mode }).render()
}

/** The layer `PortalProbe` opens. */
function Layer() {
  return Div({ 'data-portal-layer': 'open', children: 'portal layer' }).render()
}

/** Reports whether `usePortal` finds a provider, and opens a layer once mounted when it does. */
export function PortalProbe() {
  let portal: ReturnType<typeof usePortal> | null
  try {
    portal = usePortal()
  } catch {
    portal = null
  }
  useEffect(() => {
    portal?.open(Layer)
  }, []) // once, on mount
  const state = portal ? 'provider' : 'no-provider'
  return Output({ 'data-portal-probe': state, children: state }).render()
}
