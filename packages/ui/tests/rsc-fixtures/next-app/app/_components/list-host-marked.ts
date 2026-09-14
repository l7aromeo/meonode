import { Div } from '@meonode/ui'
import type { Children } from '@meonode/ui'

/**
 * Wrapper whose own inner node carries the marker, which is what a compiled
 * app produces: `Div({ children })` reads `children` as a bare identifier and
 * the plugin classifies that as generated.
 */
export function ListHostMarked({ children }: { children?: Children }) {
  return Div({ 'data-testid': 'list-host', children, ['__meo$list']: 1 } as never).render()
}
