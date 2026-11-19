'use client'
import { Div, Img } from '@meonode/ui'

/** A client component that places an img it has already built inside a node. */
export default function BuiltElementClient() {
  const built = Img({
    id: 'built-in-client-component',
    'data-testid': 'built-in-client-component',
    alt: 'c',
    props: { width: 40, height: 30 },
    style: { opacity: 0.5 },
  }).render()
  return Div({ children: built }).render()
}
