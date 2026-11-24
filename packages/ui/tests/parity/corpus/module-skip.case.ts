// A module that already uses the identifier one of the compiler's helpers is
// imported as gets no extraction at all, so its static styles stay on the
// runtime path.
import type { ReactElement } from 'react'
import { Div, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.style-props', 'value.string', 'env.ssr-hydrate'],
  routes: ['RUNTIME:module-skip'],
  routing: [{ node: 'skipped', route: 'RUNTIME:module-skip' }],
}

/** Holds the name the compiler would import its value helper as. */
const __meoVal = 'taken'

export function App(): ReactElement {
  return Div({
    key: 'skipped',
    padding: 6,
    color: 'rgb(0, 70, 140)',
    borderBottom: '1px solid rgb(0, 0, 0)',
    children: Span(__meoVal, { key: 'name' }),
  }).render() as ReactElement
}
