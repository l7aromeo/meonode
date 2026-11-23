// Custom properties and var() (parts/custom-props.ts), server-rendered, then hydrated.
// The computed values of the properties that use them, and the custom properties themselves, must match extraction off.
import { createElement, type ReactElement } from 'react'
import { CUSTOM_PROPS, CustomProps, NEXT_STEP } from './parts/custom-props.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['value.custom-property', 'place.not-css-prop', 'at.property', 'at.media', 'place.css', 'place.component-target', 'dyn.state', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:not-extractable'],
  routing: [
    { node: 'gap-parent', route: 'NAMED' },
    { node: 'gap-parent-runtime', route: 'RUNTIME:css-not-literal' },
    { node: 'gap-child', route: 'NAMED' },
    { node: 'gap-child-runtime', route: 'RUNTIME:css-not-literal' },
    { node: 'fallbacks', route: 'CARRIER' },
    { node: 'registered', route: 'NAMED' },
    { node: 'size-child', route: 'NAMED' },
    { node: 'dynamic', route: 'CARRIER' },
    { node: 'overrides', route: 'NAMED' },
    { node: 'inline', route: 'NAMED' },
    // The node prop stays in the call as a DOM prop, as the runtime treats it.
    { node: 'top-level', route: 'NAMED' },
  ],
  customProps: CUSTOM_PROPS,
  breakpoints: [600],
  steps: [
    { name: 'step 2', click: NEXT_STEP },
    { name: 'step 3', click: NEXT_STEP },
  ],
}

export function App(): ReactElement {
  return createElement(CustomProps)
}
