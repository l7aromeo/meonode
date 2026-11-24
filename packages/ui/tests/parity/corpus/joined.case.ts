// Calls of factories imported from another module (parts/joined.ts): the
// compiler joins each call with the factory's defaults at run time
// (`__meoFactoryCall`), and the join names the style or refuses and leaves it
// to the runtime. A call that only adds style, one that overrides a default,
// one with no style of its own, one whose css holds serialized styles, a
// factory whose defaults turn Emotion off, and one whose defaults read theme
// tokens. A call that turns Emotion off itself is not joined: the compiler
// leaves it a plain call on the runtime path.
import type { ReactElement } from 'react'
import { Div } from '@meonode/ui'
import type { CaseMeta } from '../case.js'
import { Chip, Plain, Themed } from './parts/joined.js'

export const meta: CaseMeta = {
  shapes: ['place.create-node', 'place.style-props', 'place.css', 'value.token', 'env.ssr-hydrate'],
  routes: ['JOINED', 'RUNTIME:node-prop'],
  routing: [
    { node: 'joined', route: 'JOINED' },
    { node: 'override', route: 'JOINED' },
    { node: 'bare', route: 'JOINED' },
    { node: 'serialized', route: 'JOINED' },
    { node: 'off', route: 'RUNTIME:node-prop' },
    { node: 'defaults-off', route: 'JOINED' },
    { node: 'themed', route: 'JOINED' },
  ],
  steps: [{ name: 'dark mode', mode: 'dark' }],
}

export function App(): ReactElement {
  return Div({
    children: [
      Chip({ key: 'joined', margin: 3, children: 'joined' }),
      Chip({ key: 'override', padding: 6, css: { color: 'rgb(0, 0, 150)' }, children: 'override' }),
      Chip({ key: 'bare', children: 'no style of its own' }),
      Chip({ key: 'serialized', css: { styles: 'font-style: italic;' }, children: 'serialized' }),
      Chip({ key: 'off', disableEmotion: true, margin: 5, children: 'emotion off' }),
      Plain({ key: 'defaults-off', margin: 2, children: 'defaults off' }),
      Themed({ key: 'themed', margin: 1, children: 'themed defaults' }),
    ],
  } as never).render() as ReactElement
}
