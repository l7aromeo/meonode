import { Div, Node } from '@meonode/ui'
import { PortalProbe, ThemeProbe } from '../_parts/probes'
import { Cached } from '../_parts/cached'

/** Both probes with no provider above them: the control. */
export default function Page() {
  return Div({ children: [Node(ThemeProbe, { key: 'theme' }), Node(PortalProbe, { key: 'portal' }), Node(Cached, { key: 'cached' })] }).render()
}
