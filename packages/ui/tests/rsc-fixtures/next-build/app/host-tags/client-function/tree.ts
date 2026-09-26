'use client'
import { createNode, Div } from '@meonode/ui'

/** Styles itself and passes the `className` it is handed on to its own element. */
function Card({ className, children }: { className?: string; children?: string }) {
  return Div({ className, 'data-testid': 'client-function', color: 'rgb(0, 128, 128)', paddingLeft: 7, children }).render()
}

const CardNode = createNode(Card)

/**
 * A function component given `css` by a client component. On the server this
 * is the SSR pass, which the browser hydrates, so both must produce the same
 * classes: the caller's css composed over the component's own, as one class.
 */
export function ClientFunctionTree() {
  return Div({ children: CardNode({ css: { color: 'rgb(255, 165, 0)' }, children: 'client function' }) }).render()
}
