// A theme token the active theme does not define, as a value, on :hover over a
// base background. Every side writes it as var(--meonode-theme-notDefined),
// which computes as unset, so the hover background is transparent on all of
// them. The runtime drops only keys that hold a token (an at-rule prelude), not
// values, so this is not a recorded difference: the CSS text is the same on
// every side, in every engine.
import type { ReactElement } from 'react'
import { Div } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['value.token', 'sel.pseudo-class', 'place.css', 'env.ssr-hydrate'],
  routes: ['NAMED'],
  routing: [{ node: 'missing', route: 'NAMED' }],
}

export function App(): ReactElement {
  return Div({
    key: 'missing',
    padding: 6,
    backgroundColor: 'rgb(255, 240, 200)',
    css: { '&:hover': { backgroundColor: 'theme.notDefined' } },
    children: 'hover me',
  }).render() as ReactElement
}
