import type { ReactNode } from 'react'
import { Div, Node } from '@meonode/ui'

/** A plain function component: its css reaches it as a compiled class name. */
function Card({ className, children, 'data-case': dataCase, 'data-size': dataSize }: { className?: string; children?: ReactNode; 'data-case'?: string; 'data-size'?: string }) {
  return Div({ className, 'data-case': dataCase, 'data-size': dataSize, children }).render()
}

/**
 * A theme token in each place a key can hold one: a media condition, a container
 * condition, a supports condition and a selector. Each sets its own property, so
 * each can be checked on its own.
 */
export const THEMED_KEYS = {
  '@media (width >= theme.breakpoint.wide)': { color: 'rgb(220, 20, 60)' },
  '@container (min-width: theme.breakpoint.wide)': { backgroundColor: 'rgb(0, 0, 255)' },
  '@supports (width: theme.breakpoint.wide)': { borderLeftStyle: 'solid', borderLeftWidth: '7px' },
  '&[data-size="theme.breakpoint.wide"]': { letterSpacing: '3px' },
}

/** A host tag and a function component in a server component, inside one inline-size container. */
export const themedTree = () =>
  Div({
    containerType: 'inline-size',
    children: [
      Div({ key: 'host', 'data-case': 'host', 'data-size': '1000px', css: THEMED_KEYS, children: 'host tag' }),
      Node(Card, { key: 'fn', 'data-case': 'fn', 'data-size': '1000px', css: THEMED_KEYS, children: 'function component' }),
    ],
  }).render()
