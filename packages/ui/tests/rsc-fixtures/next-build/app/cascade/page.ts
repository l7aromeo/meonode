import { Node } from '@meonode/ui'
import { CALLER, CardNode } from '../_shared/card'
import { later } from '../_shared/late'

/** The cascade case, prerendered, with the caller's compile delayed past a macrotask. */
async function Content() {
  'use cache'
  await later()
  return CardNode({ css: CALLER, children: 'conflict' }).render()
}

export default function Page() {
  return Node(Content).render()
}
