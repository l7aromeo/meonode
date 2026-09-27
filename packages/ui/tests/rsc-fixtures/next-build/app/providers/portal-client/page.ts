import { Node } from '@meonode/ui'
import { ClientPortal } from '../_parts/wrappers'
import { Cached } from '../_parts/cached'

/** `PortalProvider` rendered from a client wrapper. */
export default function Page() {
  return Node(ClientPortal, { children: Node(Cached) }).render()
}
