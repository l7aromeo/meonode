// The prepend-cache case rendered on the client only, so the static rules
// register before Emotion inserts any: a user stylesheet (.card { padding: 0 })
// in the head, and hosts with class "card" and an extracted padding under an
// Emotion cache that prepends its styles, and under a second prepended cache
// with another key. The user's .card must win the tie on both sides.
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import type { ReactElement } from 'react'
import { Div, Node } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  render: 'client',
  shapes: ['place.style-props', 'place.classname-merge', 'env.client-only'],
  routes: ['CARRIER', 'RUNTIME:not-extractable'],
  routing: [
    { node: 'card', route: 'CARRIER' },
    { node: 'card-other', route: 'CARRIER' },
  ],
  pageCss: '.card{padding:0;border:1px solid rgb(0, 0, 0)}',
}

const prepended = createCache({ key: 'css', prepend: true })
const other = createCache({ key: 'other', prepend: true })

export function App(): ReactElement {
  return Node(CacheProvider, {
    value: prepended,
    children: Div({
      children: [
        Div({ key: 'card', className: 'card', padding: 16, children: 'card under a prepended cache' }),
        Node(CacheProvider, {
          key: 'other',
          value: other,
          children: Div({ key: 'card-other', className: 'card', padding: 12, children: 'card under a second prepended cache' }),
        }),
      ],
    } as never),
  } as never).render() as ReactElement
}
