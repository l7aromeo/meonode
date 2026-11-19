'use client'
import { createElement, type ReactNode } from 'react'

/** A client component written without MeoNode, rendering the children it is given. */
export default function ClientChildren({ children }: { children?: ReactNode }) {
  return createElement('section', null, children)
}
