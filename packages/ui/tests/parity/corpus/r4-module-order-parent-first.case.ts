// A parent's & .child rule and the child's own .wrapper & rule, equal in
// specificity on one element, from two modules evaluated parent first, the
// reverse of r4-module-order. Emotion orders the two by when each class is
// first inserted; extracted rules are ordered by registration, and the
// computed colour must be the same either way.
import type { ReactElement } from 'react'
import { createElement } from 'react'
import { Parent } from './parts/r4c-parent.js'
import { Child } from './parts/r4c-child.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.descendant', 'sel.ancestor', 'place.css', 'place.component-target', 'env.ssr-hydrate'],
  routes: ['CARRIER'],
}

export function App(): ReactElement {
  return createElement(Parent, null, createElement(Child))
}
