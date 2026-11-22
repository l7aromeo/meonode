// Nodes the compiler leaves whole on the runtime path although every value is
// static: a factory made in the module, the as and disableEmotion props, css
// held in a variable, a css object with a spread or a computed key, and a
// label key. The wrapper has no styles, so
// nothing in this module may extract.
import type { ReactElement } from 'react'
import { createNode, Div } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.style-props', 'place.css', 'place.create-node', 'place.as', 'place.disable-emotion', 'env.ssr-hydrate'],
  routes: ['runtime:local-factory', 'runtime:node-prop', 'runtime:css-not-literal', 'runtime:css-spread-computed', 'runtime:css-label-styles'],
  routing: [
    { node: 'chip', route: 'runtime:local-factory', runtime: ['backgroundColor'], whole: true },
    { node: 'as', route: 'runtime:node-prop', runtime: ['margin', 'color'], whole: true },
    { node: 'disabled', route: 'runtime:node-prop', runtime: ['padding'], whole: true },
    { node: 'held', route: 'runtime:css-not-literal', runtime: ['css'], whole: true },
    { node: 'spread', route: 'runtime:css-spread-computed', runtime: ['color', 'textDecoration'], whole: true },
    { node: 'computed', route: 'runtime:css-spread-computed', runtime: ['borderStyle'], whole: true },
    { node: 'label', route: 'runtime:css-label-styles', runtime: ['label', 'fontStyle'], whole: true },
  ],
}

const Chip = createNode('span', { padding: '1px 4px', borderRadius: 6, backgroundColor: 'rgb(230, 230, 230)' })
const held = { color: 'rgb(0, 0, 160)', letterSpacing: 1 }
const base = { fontWeight: 600 }
const EDGE = 'Bottom'

export function App(): ReactElement {
  return Div({
    children: [
      Chip({ key: 'chip', backgroundColor: 'rgb(200, 240, 200)', children: 'local factory' }),
      Div({ key: 'as', as: 'section', margin: 3, color: 'rgb(90, 0, 0)', children: 'as section' }),
      Div({ key: 'disabled', disableEmotion: true, padding: 7, children: 'emotion off' }),
      Div({ key: 'held', css: held, children: 'css in a variable' }),
      Div({ key: 'spread', css: { ...base, color: 'rgb(0, 110, 0)', textDecoration: 'underline' }, children: 'css spread' }),
      Div({ key: 'computed', css: { [`border${EDGE}`]: '2px solid rgb(0, 0, 0)', borderStyle: 'dashed' }, children: 'computed key' }),
      Div({ key: 'label', css: { label: 'parity-label', fontStyle: 'italic' }, children: 'labelled' }),
    ],
  } as never).render() as ReactElement
}
