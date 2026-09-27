'use client'

import { useEffect } from 'react'

/** Marks the document once React has hydrated it, so the harness reads the hydrated DOM. */
export function Hydrated() {
  useEffect(() => {
    document.documentElement.setAttribute('data-hydrated', '1')
  }, [])
  return null
}
