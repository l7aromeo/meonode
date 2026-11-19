import { createElement } from 'react'
import { Div, Img, Node, Span } from '@meonode/ui'
import BuiltElementClient from '../_components/built-element-client'
import ClientChildren from '../_components/client-children'

/** An img built with attributes a styling engine would read as css, and an inline style. */
const built = (id: string) => Img({ id, alt: id, 'data-testid': id, props: { width: 40, height: 30 }, style: { opacity: 0.5 } }).render()

// Elements already built, placed as children in a server component: of a host
// node, of a node with Emotion disabled, of a client component across Flight, and
// inside a client component; and a built span whose inline style holds a theme
// token of the root layout's provider.
export default function Page() {
  return Div({
    'data-testid': 'built-elements-page',
    children: [
      Div({ children: built('built-in-host') }),
      Div({
        children: createElement('img', { id: 'created-in-host', 'data-testid': 'created-in-host', alt: 'r', width: 40, height: 30, style: { opacity: 0.5 } }),
      }),
      Div({ disableEmotion: true, children: built('built-in-disabled') }),
      Node(ClientChildren, { children: built('built-in-client-child') }),
      Node(BuiltElementClient),
      Div({ children: Span('token', { id: 'built-style-token', 'data-testid': 'built-style-token', style: { color: 'theme.primary.default' } }).render() }),
    ],
  }).render()
}
