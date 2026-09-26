import { createElement } from 'react'
import { createNode, Node } from '@meonode/ui'
import { Slot } from '../_shared/slots'

function ServerInput(props: { className?: string }) {
  return createElement('input', { ...props, readOnly: true, value: 'slotted' })
}
const Input = createNode(ServerInput)

/** `/slot-root` with a void element at the root, which can hold no children. */
function StyledInput() {
  return Input({ css: { color: 'rgb(54, 76, 98)' }, 'data-testid': 'slotted' } as never).render()
}

export default function Page() {
  return Node(Slot, { children: Node(StyledInput) }).render()
}
