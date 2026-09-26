import { Button, Node } from '@meonode/ui'
import { Slot } from '../../_shared/slots'

/** A server component whose output is one styled host element, handed to an `asChild` slot. */
function StyledButton() {
  return Button('slotted', { css: { color: 'rgb(98, 76, 54)' }, 'data-testid': 'slotted' }).render()
}

export default function Page() {
  return Node(Slot, { children: Node(StyledButton) }).render()
}
