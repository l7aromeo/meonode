'use client'
import { createElement, type ReactNode } from 'react'

/** A client component written without MeoNode, rendering a prop where React expects a node. */
export default function ClientSlot({ slot }: { slot?: ReactNode }) {
  return createElement('section', { 'data-testid': 'client-slot' }, slot)
}
