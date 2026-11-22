// The parent half of a cross-module rule pair (r4-* cases): a per-node rule for
// its .child descendants, at the same specificity as the child's own rule.
import type { ReactElement } from 'react'
import { Div } from '@meonode/ui'

/** A wrapper whose rule colours .child descendants red. */
export function Parent({ children }: { children?: ReactElement }): ReactElement {
  return Div({ key: 'parent', className: 'wrapper', css: { '& .child': { color: 'rgb(200, 0, 0)' } }, children }).render() as ReactElement
}
