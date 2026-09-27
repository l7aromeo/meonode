'use client'

import { lazy } from 'react'
import { Node } from '@meonode/ui'

/** `ThemedProbe` loaded on demand, so the test can hold its boundary dehydrated. */
const Delayed = lazy(() => import('./themed-probe').then(module => ({ default: module.ThemedProbe })))

export function LazyThemedProbe() {
  return Node(Delayed).render()
}
