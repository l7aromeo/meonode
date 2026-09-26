import { Node, ThemeProvider } from '@meonode/ui'
import { ThemeProbe } from '../_parts/probes'
import { THEME } from '../_parts/theme'
import { Cached } from '../_parts/cached'

/** `ThemeProvider` rendered from a server component, with a client component below calling `useTheme`. */
export default function Page() {
  return ThemeProvider({ ...THEME, children: [Node(ThemeProbe, { key: 'probe' }), Node(Cached, { key: 'cached' })] }).render()
}
