'use client'
import { Div, Node } from '@meonode/ui'
import { HocClientCard, IdProbe } from '../_components/hoc-client'

// Interleaves `Component`-built client components with plain client components
// that render their own `useId`. If the HOC's client-only `useId` shifted the
// id tree, the probes would hydrate with different values than the server sent.
export default function Page() {
  return Div({
    'data-testid': 'hoc-client-hydration-page',
    children: [
      Node(IdProbe, { name: 'before' }),
      HocClientCard({ label: 'alpha' }),
      Node(IdProbe, { name: 'between' }),
      HocClientCard({ label: 'beta' }),
      Node(IdProbe, { name: 'after' }),
    ],
  }).render()
}
