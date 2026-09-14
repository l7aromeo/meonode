import { Div } from '@meonode/ui'
import type { Children } from '@meonode/ui'

/**
 * Plain sync server component that renders whatever children it is handed.
 *
 * Deliberately a *component* rather than a host tag: `core.node.ts` routes a
 * styled node to its server-only `createElement` branch only when
 * `typeof renderTarget !== 'string'`, so a `Div` with the same `css` would take
 * the StyledRenderer branch instead and never reach the code under test.
 */
export function ListHostServer({ children, 'data-testid': testId }: { children?: Children; 'data-testid'?: string }) {
  return Div({ 'data-testid': testId ?? 'list-host', children }).render()
}
