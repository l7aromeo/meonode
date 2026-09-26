import { createElement, type ReactNode } from 'react'
import { createNode, Node } from '@meonode/ui'
import { Slot } from '../_shared/slots'

function ServerButton(props: { children?: ReactNode; className?: string }) {
  return createElement('button', props)
}
const Button = createNode(ServerButton)

/** A server component whose output is one styled element, handed to an `asChild` slot. */
function StyledButton() {
  return Button({ css: { color: 'rgb(98, 76, 54)' }, 'data-testid': 'slotted', children: 'slotted' } as never).render()
}

export default function Page() {
  return Node(Slot, { children: Node(StyledButton) }).render()
}
