// Children that read custom properties a parent in another module sets, for
// the custom-props-* cases: one extracted, one on the runtime path (its css
// held in a variable), and one reading a registered, non-inheriting property.
import type { ReactElement } from 'react'
import { Span } from '@meonode/ui'

const held = { paddingRight: 'var(--parity-gap)' }

export function GapChild(): ReactElement {
  return Span('extracted child', { key: 'gap-child', css: { paddingLeft: 'var(--parity-gap)' } }).render() as ReactElement
}

export function GapChildRuntime(): ReactElement {
  return Span('runtime child', { key: 'gap-child-runtime', css: held }).render() as ReactElement
}

export function SizeChild(): ReactElement {
  return Span('registered child', { key: 'size-child', display: 'inline-block', css: { width: 'var(--parity-size)' } }).render() as ReactElement
}
