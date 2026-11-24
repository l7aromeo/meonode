// The parent halves of S2 and S3 for the s-split-* cases, in a module the
// cases import after the children's.
import type { ReactElement } from 'react'
import { Div, Node } from '@meonode/ui'
import { S2Child, S3Child, S3HoverChild } from './s-split-child.js'

/** S2 and S3 with each child from the other module. */
export function Shapes(): ReactElement {
  return Div({
    children: [
      Div({ key: 's2', className: 'wrapper', css: { '& .child': { color: 'rgb(3, 0, 0)' } }, children: Node(S2Child) }),
      Div({ key: 's3', css: { '& > *': { color: 'rgb(5, 0, 0)' } }, children: Node(S3Child) }),
      Div({ key: 's3-hover', css: { '& .child': { color: 'rgb(7, 0, 0)' } }, children: Node(S3HoverChild) }),
    ],
  } as never).render() as ReactElement
}
