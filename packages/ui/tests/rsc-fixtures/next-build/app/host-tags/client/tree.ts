'use client'
import { Div, Span } from '@meonode/ui'

/**
 * Host tags rendered by a client component: on the server this is the SSR pass,
 * where they keep `StyledRenderer`, because the client renders them that way
 * when it hydrates.
 */
export function ClientTree({ label }: { label: string }) {
  return Div({
    'data-testid': 'client-tree',
    css: { color: 'rgb(23, 45, 67)', '&:hover': { color: 'rgb(67, 45, 23)' } },
    children: Span(label, { css: { fontWeight: 700 } }),
  }).render()
}
