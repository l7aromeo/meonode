import { createElement, type ReactNode } from 'react'
import { createNode, Node } from '@meonode/ui'
import { Slot } from '../_shared/slots'

function ServerButton(props: { children?: ReactNode; className?: string }) {
  return createElement('button', props)
}
const Button = createNode(ServerButton)

/** `/slot-root` without css: the control. */
function PlainButton() {
  return Button({ 'data-testid': 'slotted', children: 'slotted' } as never).render()
}

export default function Page() {
  return Node(Slot, { children: Node(PlainButton) }).render()
}
