import NextLink from 'next/link'
import { A, createNode, Div } from '@meonode/ui'

const Link = createNode(NextLink)

/**
 * #32: a factory around `next/link`, rendered from a server component.
 *
 * The intrinsic `A` beside it is the control, so a page where neither has its
 * rule points at the harness rather than the link.
 */
export default function Page() {
  return Div({
    children: [
      Link({ key: 'link', href: '/', color: 'red', textDecoration: 'none', children: 'home via next/link' }),
      A({ key: 'a', href: '/', color: 'teal', textDecoration: 'none', children: 'home via a' }),
    ],
  }).render()
}
