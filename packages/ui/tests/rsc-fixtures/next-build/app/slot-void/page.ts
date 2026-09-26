import { Node } from '@meonode/ui'
import { Input } from '../_shared/controls'
import { Slot } from '../_shared/slots'

/** `/slot-root` with a void element at the root. */
function StyledInput() {
  return Input({ css: { color: 'rgb(54, 76, 98)' }, 'data-testid': 'slotted' } as never).render()
}

export default function Page() {
  return Node(Slot, { children: Node(StyledInput) }).render()
}
