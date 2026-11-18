import { createElement } from 'react'
import { Div, Input, Node } from '@meonode/ui'
import OnlyChildClone from '../../_shared/only-child-clone'

const wideKey = { '@media (width >= theme.breakpoint.wide)': { color: 'rgb(0, 128, 0)' } }

/** A server component handed css, rendering a host with the class it is given. */
function ServerInput({ className }: { className?: string }) {
  return createElement('input', { className, 'data-only-child': 'component', readOnly: true, value: 'component' })
}

// A client component that clones its one child, given a void host and a server
// component, each with a css key holding a token the provider above defines.
export default function Page() {
  return Div({
    children: [
      Node(OnlyChildClone, { key: 'host', children: Input({ 'data-only-child': 'host', readOnly: true, value: 'host', css: wideKey }) }),
      Node(OnlyChildClone, { key: 'component', children: Node(ServerInput, { css: wideKey } as never) }),
    ],
  }).render()
}
