'use client'
import { Children, cloneElement, isValidElement, useEffect, useRef, type ReactElement, type ReactNode } from 'react'

/**
 * Takes exactly one child and clones it with a ref and a prop, as MUI Tooltip,
 * Popper anchors and Slot/asChild components do. The child it is given must be
 * the element itself, or `Children.only` throws and the ref lands elsewhere.
 */
export default function OnlyChildClone({ children }: { children?: ReactNode }) {
  const child = Children.only(children)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.dataset.refAttached = 'yes'
  }, [])
  if (!isValidElement(child)) return null
  return cloneElement(child as ReactElement<Record<string, unknown>>, { ref, 'data-cloned': 'yes' })
}
