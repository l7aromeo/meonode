// Where styles are written: style props, css, the props escape hatch, the
// style attribute, className merging, `as`, a component target, createNode
// defaults merged with call-site styles, and built elements as children.
import type { ReactElement } from 'react'
import { createNode, Div, Node, Section, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: [
    'place.style-props',
    'place.css',
    'place.props-escape',
    'place.style-attr',
    'place.classname-merge',
    'place.as',
    'place.component-target',
    'place.create-node',
    'place.built-children',
    'env.ssr-hydrate',
  ],
  routes: ['CARRIER', 'FACTORY_MERGED', 'RUNTIME:node-prop', 'RUNTIME:not-extractable'],
  routing: [
    { node: 'card', route: 'RUNTIME:not-extractable' },
    { node: 'badge2', route: 'FACTORY_MERGED' },
    { node: 'as', route: 'RUNTIME:node-prop' },
    { node: 'outer', route: 'CARRIER' },
  ],
}

/** A component that renders the class and style it is given, and a height it reads as data. */
function Card({ className, style, height, children }: { className?: string; style?: object; height?: number; children?: unknown }): ReactElement {
  return Div({ className, style, 'data-height': String(height), children: children as never }).render() as ReactElement
}

const Badge = createNode('span', { padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgb(220, 220, 255)' })

export function App(): ReactElement {
  const built = Span('built child', { color: 'rgb(0, 100, 0)' }).render()
  return Section({
    key: 'outer',
    padding: 8,
    className: 'outer extra',
    style: { borderTop: '1px solid rgb(0, 0, 0)' },
    children: [
      Div({ key: 'as', as: 'article', margin: 4, css: { color: 'rgb(100, 0, 0)' }, children: 'as article' }),
      Node(Card, { key: 'card', padding: 6, backgroundColor: 'rgb(250, 250, 250)', props: { height: 120 }, children: 'card' }),
      Badge({ key: 'badge1', children: 'default' }),
      Badge({ key: 'badge2', backgroundColor: 'rgb(255, 220, 220)', children: 'overridden' }),
      Div({ key: 'built', children: built }),
    ],
  } as never).render() as ReactElement
}
