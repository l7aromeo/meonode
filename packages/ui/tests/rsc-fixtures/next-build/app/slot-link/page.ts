import { Node } from '@meonode/ui'
import { Link } from '../_shared/controls'
import { Slot } from '../_shared/slots'

/** `/slot-child` with `next/link` as the styled child. */
export default function Page() {
  return Node(Slot, { children: Link({ href: '/', css: { color: 'rgb(76, 98, 54)' }, 'data-testid': 'slotted', children: 'home' } as never) }).render()
}
