import { createElement } from 'react'
import { Div, Node } from '@meonode/ui'
import OnlyChildClone from '../../../_components/only-child-clone'

/** A server component handed css, rendering a host with the class it is given. */
function ServerInput({ className }: { className?: string }) {
  return createElement('input', { className, 'data-testid': 'only-child-component', readOnly: true, value: 'component' })
}

// A client component that clones its one child, given a server component with a css key holding a token the root layout's provider defines.
export default function Page() {
  return Div({
    children: Node(OnlyChildClone, {
      children: Node(ServerInput, { css: { '@media (min-width: theme.breakpoint.md)': { color: 'rgb(0, 128, 0)' } } } as never),
    }),
  }).render()
}
