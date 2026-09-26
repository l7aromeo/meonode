import { createNode, Div } from '@meonode/ui'

/**
 * A server component that styles itself and passes the caller's `className`
 * through. The caller's `css` is server-compiled into that className and the
 * component's own is an emotion class on the same element, both setting `color`
 * at equal specificity — so source order decides, and the component's own must
 * win, as the client's `StyledRenderer` path already has it.
 */
function Card({ className, children }: { className?: string; children?: string }) {
  return Div({ className, 'data-testid': 'conflict', color: 'rgb(0, 128, 128)', children }).render()
}

export const CardNode = createNode(Card)
