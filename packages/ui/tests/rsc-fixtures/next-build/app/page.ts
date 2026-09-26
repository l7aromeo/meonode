import { Node } from '@meonode/ui'
import { Reproduction } from './_shared/registry-nodes'

/** #35: the issue's reproduction, rendered where `StyleRegistry` collects it. */
export default function Page() {
  return Node(Reproduction).render()
}
