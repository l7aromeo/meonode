import type { ReactNode } from 'react'
import { Div, Node } from '@meonode/ui'

const STYLED = { color: 'rgb(34, 56, 78)', padding: '2px 5px' }

/** A component that takes a render prop and calls it itself. */
function Consumer({ children }: { children: (value: string) => ReactNode }) {
  return Div({ 'data-testid': 'component-target', children: children('from the component') }).render()
}

/**
 * A render prop as the only child of an HTML element, unstyled and styled, beside
 * a component that receives one. Each is a keyed member of the outer children.
 */
export const tree = () =>
  Div({
    children: [
      Div({ key: 'plain', children: () => Div({ 'data-testid': 'bare-plain', children: 'from a render prop' }) }),
      Div({ key: 'styled', css: STYLED, children: () => Div({ 'data-testid': 'bare-styled', css: STYLED, children: 'from a styled host' }) }),
      Node(Consumer, { key: 'component', children: (value: string) => value }),
    ],
  })
