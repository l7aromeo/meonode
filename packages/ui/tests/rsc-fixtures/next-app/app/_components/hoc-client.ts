'use client'
import { useId } from 'react'
import { Component, Div, Span } from '@meonode/ui'

/**
 * A client component built with the `Component` HOC, memoized.
 *
 * Nothing else in this fixture app combines the two, and the combination is
 * where the interesting work happens: a memoized subtree renders inside a
 * `MeoMemo` fiber that exists on the client only — the server memoizes nothing
 * and emits no wrapper. So the client tree carries a component the server HTML
 * did not, which has to hydrate cleanly.
 */
export const HocClientCard = Component<{ label: string }>(props =>
  Div(
    {
      'data-testid': `hoc-client-${props.label}`,
      padding: '4px',
      children: [Span(props.label, { 'data-testid': `hoc-client-label-${props.label}` })],
    },
    [props.label],
  ),
)

/**
 * Renders its own `useId` into the DOM. React derives these ids from a
 * component's position in the fiber tree, so a wrapper appearing on the client
 * but not on the server would move them — and it would show up here as a
 * hydration mismatch on visible text, which is the loudest form React reports.
 */
export function IdProbe({ name }: { name: string }) {
  const id = useId()
  return Div({
    'data-testid': `id-probe-${name}`,
    children: Span(id, { 'data-testid': `id-probe-value-${name}` }),
  }).render()
}
