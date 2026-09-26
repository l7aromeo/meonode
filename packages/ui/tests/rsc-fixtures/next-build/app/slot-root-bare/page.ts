import { Node } from '@meonode/ui'
import { Button } from '../_shared/controls'
import { Slot } from '../_shared/slots'

/** `/slot-root` without css: the control. */
function PlainButton() {
  return Button({ 'data-testid': 'slotted', children: 'slotted' } as never).render()
}

export default function Page() {
  return Node(Slot, { children: Node(PlainButton) }).render()
}
