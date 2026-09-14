import { Div } from '@meonode/ui'
import type { Children } from '@meonode/ui'

/**
 * Plain sync server component that renders whatever children it is handed.
 *
 * Deliberately a *component* rather than a host tag: `core.node.ts` routes a
 * styled node to its server-only `createElement` branch only when
 * `typeof renderTarget !== 'string'`, so a `Div` with the same `css` would take
 * the StyledRenderer branch instead and never reach the code under test.
 *
 * It also reports whether its own inner node was marked, because that decides
 * what the test should expect and the test cannot see it. Whether this node
 * carries `__meo$list` is a question about the *fixture's* compilation — Next
 * runs the plugin over these files — and a probe built inside the test file
 * would answer for the test file instead, which is compiled by vitest and not
 * by the plugin at all. So the fixture answers it here and hands the result out
 * through the DOM.
 *
 * The probe has the same shape as the real node below: `children` as a
 * shorthand, which the compiler reads as a bare identifier and therefore calls
 * generated. Both are marked or neither is.
 */
export function ListHostServer({ children, 'data-testid': testId }: { children?: Children; 'data-testid'?: string }) {
  const probe = Div({ children })
  const innerMarked = '__meo$list' in (probe.rawProps as Record<string, unknown>)
  return Div({ 'data-testid': testId ?? 'list-host', 'data-inner-marked': String(innerMarked), children }).render()
}
