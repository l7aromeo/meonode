import { Node } from '@meonode/ui'
import { Button } from '../_shared/controls'
import { Slot } from '../_shared/slots'

/** A server component whose own render is one styled server-function-component element, handed to a cloning slot. */
function StyledButton() {
  return Button({ css: { color: 'rgb(98, 76, 54)' }, 'data-testid': 'slotted', children: 'slotted' } as never).render()
}

export default function Page() {
  return Node(Slot, { children: Node(StyledButton) }).render()
}
