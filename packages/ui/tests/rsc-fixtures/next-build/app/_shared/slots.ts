'use client'
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

/** Holds a panel and never renders it, as a closed dialog or an inactive tab does. */
export function Closed(_: { panel?: ReactNode }) {
  return null
}

/** Renders the panel it holds. */
export function Open({ panel }: { panel?: ReactNode }) {
  return panel ?? null
}

/**
 * Clones its only child with an extra prop, as an `asChild` slot does. A child
 * that is not a single element renders nothing, which is what such a slot does
 * with an array.
 */
export function Slot({ children }: { children?: ReactNode }) {
  return isValidElement(children) ? cloneElement(children as ReactElement<Record<string, unknown>>, { 'data-cloned': 'yes' }) : null
}
