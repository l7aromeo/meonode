// The child halves of S2 and S3 for the s-split-* cases, in a module of their
// own that the cases import before the parents'.
import type { ReactElement } from 'react'
import { Span } from '@meonode/ui'

export function S2Child(): ReactElement {
  return Span('S2 child', { className: 'child', css: { '.wrapper &': { color: 'rgb(4, 0, 0)' } } }).render() as ReactElement
}

export function S3Child(): ReactElement {
  return Span('S3 child', { color: 'rgb(6, 0, 0)' }).render() as ReactElement
}

export function S3HoverChild(): ReactElement {
  return Span('S3 hover child', { className: 'child', css: { '&:hover': { color: 'rgb(8, 0, 0)' } } }).render() as ReactElement
}
