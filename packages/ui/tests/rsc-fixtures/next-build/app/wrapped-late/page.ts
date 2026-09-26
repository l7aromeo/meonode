import { Div, Node } from '@meonode/ui'
import { later } from '../_shared/late'
import { wrappedRows } from '../_shared/rows'

/** #34, static, with the compile pinned after the registry's drain — see `later`. */
async function LateRows() {
  // Cached work is what Cache Components allows to take time during a
  // prerender; a bare timer is rejected as uncached data.
  'use cache'
  await later()
  return Div({ children: wrappedRows('late row') }).render()
}

export default function Page() {
  return Node(LateRows).render()
}
