// First, so the default build refuses the React Server Components layer before anything else loads.
import '@src/util/server-layer-guard.js'
import type { NodeElementType, NodeInstance } from '@src/types/node.type.js'
import { createRoot } from 'react-dom/client'

// Compiled output imports these from the main entry; they are here too so every
// entry offers them, and both resolve to the one registry.
export { registerStaticCss, registerStaticTemplate, type StaticCssRule } from '@src/util/static-css.util.js'
export { toCssValue } from '@src/util/css-value.util.js'
export { __meoFactoryCall } from '@src/factory-call/join.js'
export type { FactoryCallSite } from '@src/factory-call/index.js'

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
