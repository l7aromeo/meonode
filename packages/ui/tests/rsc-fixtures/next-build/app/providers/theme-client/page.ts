import { Node } from '@meonode/ui'
import { ClientThemed } from '../_parts/wrappers'
import { Cached } from '../_parts/cached'

/** `ThemeProvider` rendered from a client wrapper. */
export default function Page() {
  return Node(ClientThemed, { children: Node(Cached) }).render()
}
