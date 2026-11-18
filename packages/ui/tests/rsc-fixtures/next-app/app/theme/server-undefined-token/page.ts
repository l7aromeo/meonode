import { Div } from '@meonode/ui'

// A server component under the root layout's provider. `theme.primary.servernope`
// is not in its tokens; `theme.primary` is. Development reports the first, on the
// server and in the browser, and not the second.
export default function Page() {
  return Div({
    children: [
      Div({ key: 'undefined', 'data-testid': 'server-undefined-token', color: 'theme.primary.servernope', children: 'undefined token' }),
      Div({ key: 'defined', 'data-testid': 'server-defined-token', backgroundColor: 'theme.primary', children: 'defined token' }),
    ],
  }).render()
}
