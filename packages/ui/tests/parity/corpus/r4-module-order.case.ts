// A parent's & .child rule and the child's own .wrapper & rule, equal in
// specificity on one element, from two modules evaluated child first while the
// parent renders first. Emotion orders the two by when each class is first
// inserted; extracted rules are ordered by registration, and the computed
// colour must be the same either way. r4-module-order-parent-first evaluates
// the parent's module first.
import type { ReactElement } from 'react'
import { createElement } from 'react'
import { Child } from './parts/r4a-child.js'
import { Parent } from './parts/r4a-parent.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.descendant', 'sel.ancestor', 'place.css', 'place.component-target', 'env.ssr-hydrate'],
  routes: ['STATIC'],
}

export function App(): ReactElement {
  return createElement(Parent, null, createElement(Child))
}
