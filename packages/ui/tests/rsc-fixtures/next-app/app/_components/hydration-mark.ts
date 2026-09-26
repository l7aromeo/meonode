'use client'
import { useEffect } from 'react'

/** Sets `data-hydrated` on the document element once the tree it is mounted in has hydrated. */
export default function HydrationMark() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = ''
  }, [])
  return null
}
