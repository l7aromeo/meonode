'use client'

import { Button, useTheme } from '@meonode/ui'

/** Switches the reader to the light mode. */
export function ModeToggle() {
  const { setMode } = useTheme()
  return Button('light', { 'data-testid': 'to-light', onClick: () => setMode('light') }).render()
}
