'use client'
import { Activity, createElement, type ReactNode, useState } from 'react'
import { Button, Div, Node, Span } from '@meonode/ui'

/** A component between styled elements, which renders its children itself. */
const Wrap = ({ children }: { children?: ReactNode }) => createElement('section', { 'data-testid': 'streamed-wrap' }, children)

/**
 * Styled content a page streams in a Suspense boundary: a root whose css reads
 * the mode, styled elements on both sides of a component, and a hidden Activity
 * the server does not render, which a button shows.
 */
export default function StreamedStyles() {
  const [shown, setShown] = useState(false)
  return Div({
    'data-testid': 'streamed-root',
    padding: 'theme.spacing.md',
    css: { color: (theme: { mode: string }) => (theme.mode === 'night' ? 'rgb(1, 2, 3)' : 'rgb(4, 5, 6)'), '&:hover': { outline: '1px solid red' } },
    children: [
      Span('first', { key: 'first', 'data-testid': 'streamed-first', marginLeft: 3 }),
      Node(Wrap, {
        key: 'wrap',
        children: Div({ 'data-testid': 'streamed-inner', marginTop: 5, children: Span('deep', { 'data-testid': 'streamed-deep', paddingLeft: 7 }) }),
      }),
      Button('toggle', { key: 'toggle', 'data-testid': 'streamed-toggle', borderWidth: 2, onClick: () => setShown(value => !value) }),
      createElement(Activity, {
        key: 'activity',
        mode: shown ? 'visible' : 'hidden',
        children: Div({ 'data-testid': 'streamed-activity', paddingTop: 11, children: 'in activity' }).render(),
      }),
    ],
  }).render()
}
