'use client'
import { useId } from 'react'
import { Div, Span } from '@meonode/ui'

/** Shows the id `useId` gives it, so a shift in the tree's shape between server and browser shows. */
export function IdProbe({ name }: { name: string }) {
  const id = useId()
  return Div({ 'data-testid': `id-probe-${name}`, children: Span(id, { 'data-testid': `id-probe-value-${name}` }) }).render()
}
