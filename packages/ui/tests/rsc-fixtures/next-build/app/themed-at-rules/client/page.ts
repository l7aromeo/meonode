import { Node } from '@meonode/ui'
import { ClientTree } from './tree'

/** `/themed-at-rules` rendered from a client component: the control. */
export default function Page() {
  return Node(ClientTree).render()
}
