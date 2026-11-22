'use client'
// The page shell's mode control, a client module of its own, so a server
// component page can render it as a client reference.
import { useEffect } from 'react'
import { useTheme } from '@meonode/ui'

declare global {
  interface Window {
    __parityShell?: { setMode: (mode: string) => void; mode: () => string }
  }
}

/** Publishes the provider's mode controls for the harness. Renders nothing. */
export function ModeControl(): null {
  const { setMode, mode } = useTheme()
  useEffect(() => {
    window.__parityShell = { setMode: setMode as (mode: string) => void, mode: () => mode }
  }, [setMode, mode])
  return null
}
