import { Node, PortalHost, PortalProvider } from '@meonode/ui'
import { PortalProbe } from '../_parts/probes'
import { Cached } from '../_parts/cached'

/** `PortalProvider` rendered from a server component, with a client component below calling `usePortal`. */
export default function Page() {
  return PortalProvider({ children: [Node(PortalProbe, { key: 'probe' }), Node(Cached, { key: 'cached' }), PortalHost({ key: 'host' })] }).render()
}
