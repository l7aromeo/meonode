'use client'

import { useLayoutEffect } from 'react'
import { Output, useTheme } from '@meonode/ui'

declare global {
  interface Window {
    __modeProbeCommitted?: boolean
  }
}

/**
 * The mode as a component reading it from the provider shows it. Its first
 * commit is marked in a layout effect, so a frame painted after that commit can
 * be told apart from the server HTML painted before it.
 */
export function ModeProbe() {
  const { mode } = useTheme()
  useLayoutEffect(() => {
    window.__modeProbeCommitted = true
  }, [])
  return Output({ 'data-mode-probe': mode, children: mode }).render()
}
