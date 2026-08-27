import type { NodeElementType, NodeInstance } from '@src/types/node.type.js'
import { createRoot } from 'react-dom/client'

/**
 * Renders a Meonode instance into a DOM container.
 *
 * Two roots holding structurally identical memoized subtrees used to need a
 * per-container namespace to tell them apart, because their memo keys were
 * derived from props and position and bottomed out at the root. Memoized
 * subtrees now live in fibers of their own, so React separates the two roots
 * and nothing here has to.
 * @param node The Meonode instance to render (e.g., created with Div(), P(), etc.).
 * @param container The DOM element to mount the content into.
 * @returns The React root instance.
 */
export function render<E extends NodeElementType>(node: NodeInstance<E>, container: Element) {
  const root = createRoot(container)
  root.render(node.render())
  return root
}
