import { Suspense } from 'react'
import { Div, Node } from '@meonode/ui'
import { ModeToggle } from '../_parts/mode-toggle'
import { LazyThemedProbe } from '../_parts/lazy-themed-probe'

/** A css theme function reading the mode, inside a boundary whose chunk loads on demand, and a toggle outside it. */
export default function Page() {
  return Div({
    children: [
      Node(ModeToggle, { key: 'toggle' }),
      Node(Suspense, { key: 'boundary', fallback: Div({ children: 'loading' }).render(), children: Node(LazyThemedProbe) }),
    ],
  }).render()
}
