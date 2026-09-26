import NextLink from 'next/link'
import { createNode, Div, Node } from '@meonode/ui'
import { later } from '../_shared/late'

const Link = createNode(NextLink)

/** #32 with the compile pinned after the registry's drain — see `later`. */
async function LateLink() {
  'use cache'
  await later()
  return Div({ children: Link({ href: '/', color: 'red', textDecoration: 'none', children: 'late home via next/link' }) }).render()
}

export default function Page() {
  return Node(LateLink).render()
}
