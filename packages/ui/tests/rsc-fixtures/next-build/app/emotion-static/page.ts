import { Node } from '@meonode/ui'
import { FourRules } from '../_shared/registry-nodes'

/**
 * #35's union check needs a prerendered page with several rules that reach the
 * flush only through the registry's emotion cache, so the comparison between
 * builds measures the dedupe and nothing else.
 */
export default function Page() {
  return Node(FourRules).render()
}
