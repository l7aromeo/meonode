import { Node } from '@meonode/ui'
import { Button } from '../_shared/controls'
import { Slot } from '../_shared/slots'

/** The styled node passed to the slot as a child, so it is compiled within the page's own render. */
export default function Page() {
  return Node(Slot, { children: Button({ css: { color: 'rgb(98, 76, 54)' }, 'data-testid': 'slotted', children: 'slotted' } as never) }).render()
}
