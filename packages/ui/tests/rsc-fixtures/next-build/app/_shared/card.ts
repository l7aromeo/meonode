import { createNode, Div } from '@meonode/ui'

/**
 * A server component that styles itself and passes the caller's `className`
 * through. The caller's `css` is compiled into that className, and both set
 * `color` at equal specificity: the component's own must win, as Emotion's
 * `css` prop resolves a className it is handed.
 */
function Card({ className, children }: { className?: string; children?: string }) {
  return Div({ className, 'data-testid': 'conflict', color: 'rgb(0, 128, 128)', children }).render()
}

export const CardNode = createNode(Card)

/**
 * The caller's css for every cascade page: a `color` that conflicts with the
 * component's own, and a `padding-left` that does not, so a resolution that
 * wins the conflict by discarding the caller's rule shows.
 */
export const CALLER = { color: 'rgb(255, 165, 0)', paddingLeft: '7px' }

/** `Card` rendered inside its own `'use cache'` scope. */
async function CachedCard(props: { className?: string; children?: string }) {
  'use cache'
  return Card(props)
}

export const CachedCardNode = createNode(CachedCard)
