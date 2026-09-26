import { Node } from '@meonode/ui'
import { CardNode } from '../_shared/card'
import { later } from '../_shared/late'

/** The cascade case, prerendered, with the caller's compile pinned after the drain. */
async function Content() {
  'use cache'
  await later()
  return CardNode({ css: { color: 'rgb(255, 165, 0)' }, children: 'conflict' }).render()
}

export default function Page() {
  return Node(Content).render()
}
