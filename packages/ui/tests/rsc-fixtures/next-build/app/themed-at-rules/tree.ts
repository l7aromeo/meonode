import type { ReactNode } from 'react'
import { createChildrenFirstNode, Div, Node } from '@meonode/ui'

/** A plain function component: its css reaches it as a compiled class name. */
function Card({ className, children, 'data-case': dataCase, 'data-size': dataSize }: { className?: string; children?: ReactNode; 'data-case'?: string; 'data-size'?: string }) {
  return Div({ className, 'data-case': dataCase, 'data-size': dataSize, children }).render()
}

/**
 * A theme token in each place a key can hold one: a media condition, a container
 * condition, a supports condition, a selector, and an at-rule inside a selector
 * inside an at-rule. Each sets its own property, so each can be checked on its own.
 */
export const THEMED_KEYS = {
  '@media (width >= theme.breakpoint.wide)': {
    color: 'rgb(220, 20, 60)',
    '&[data-size="theme.breakpoint.wide"]': { '@supports (width: theme.breakpoint.wide)': { textDecorationLine: 'underline' } },
  },
  '@container (min-width: theme.breakpoint.wide)': { backgroundColor: 'rgb(0, 0, 255)' },
  '@supports (width: theme.breakpoint.wide)': { borderLeftStyle: 'solid', borderLeftWidth: '7px' },
  '&[data-size="theme.breakpoint.wide"]': { letterSpacing: '3px' },
}

/** A function component with css of its own, composing the class it is handed with it. */
function OwnCard({ className, children }: { className?: string; children?: ReactNode }) {
  return Div({ className, paddingLeft: '5px', 'data-case': 'composed', 'data-size': '1000px', children }).render()
}

/** A factory whose own css holds the tokens. */
const Chip = createChildrenFirstNode('div', { css: THEMED_KEYS })

/**
 * Every shape given the themed css in a server component, inside one inline-size
 * container: a host tag, a function component passing its class through, one
 * composing it with css of its own, a factory, and a host tag swapped to another
 * tag with `as`. `extra` adds shapes only a server render can hold.
 */
export const themedTree = (extra: ReactNode[] = []) =>
  Div({
    containerType: 'inline-size',
    children: [
      Div({ key: 'host', 'data-case': 'host', 'data-size': '1000px', css: THEMED_KEYS, children: 'host tag' }),
      Node(Card, { key: 'fn', 'data-case': 'fn', 'data-size': '1000px', css: THEMED_KEYS, children: 'function component' }),
      Chip('factory', { key: 'factory', 'data-case': 'factory', 'data-size': '1000px' }),
      Node(OwnCard, { key: 'composed', css: THEMED_KEYS, children: 'composed' }),
      Div({ key: 'as', as: 'section', 'data-case': 'as', 'data-size': '1000px', css: THEMED_KEYS, children: 'as section' }),
      ...extra,
    ],
  }).render()
