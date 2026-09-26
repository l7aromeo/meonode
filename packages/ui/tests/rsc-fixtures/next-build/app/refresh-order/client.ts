'use client'
import { createElement, useEffect } from 'react'
import { useRouter } from 'next/navigation'

declare global {
  interface Window {
    __mounts?: Record<string, number>
    __committedOrder?: string
  }
}

/** Counts its own mounts. A second mount for the same id is a remount. */
export function Counter({ id }: { id: string }) {
  useEffect(() => {
    const mounts = (window.__mounts ??= {})
    mounts[id] = (mounts[id] ?? 0) + 1
  }, [id])
  return createElement('span', { 'data-row': id }, id)
}

/**
 * The positive signal that a commit has landed. React flushes every passive
 * effect of one commit together, so once this reports an order, every row
 * that commit mounted has already counted itself — a read after it cannot
 * mistake "not yet" for "never".
 */
export function Committed({ order }: { order: string }) {
  useEffect(() => {
    window.__committedOrder = order
  }, [order])
  return null
}

/** Moves the shared rule's first occurrence by asking the server for another order. */
export function Reorder() {
  const router = useRouter()
  return createElement(
    'button',
    {
      'data-testid': 'reorder',
      onClick: () => {
        document.cookie = 'order=b; path=/'
        router.refresh()
      },
    },
    'reorder',
  )
}
