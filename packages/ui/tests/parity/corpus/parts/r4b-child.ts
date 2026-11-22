// The child half of a cross-module rule pair (r4-* cases): a per-node rule for
// itself inside a .wrapper, at the same specificity as the parent's rule.
import type { ReactElement } from 'react'
import { Span } from '@meonode/ui'

/** A .child that colours itself blue inside a .wrapper. */
export function Child(): ReactElement {
  return Span('child', { key: 'child', className: 'child', css: { '.wrapper &': { color: 'rgb(0, 0, 200)' } } }).render() as ReactElement
}
