// Custom properties and var() (parts/custom-props.ts), server-rendered, then hydrated.
// The computed values of the properties that use them, and the custom properties themselves, must match extraction off.
import { createElement, type ReactElement } from 'react'
import { CUSTOM_PROPS, CustomProps, NEXT_STEP } from './parts/custom-props.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['value.custom-property', 'place.not-css-prop', 'at.property', 'at.media', 'place.css', 'place.component-target', 'dyn.state', 'env.ssr-hydrate'],
  routes: ['STATIC', 'VAR', 'SWITCH', 'runtime:css-not-literal', 'runtime:at-rule-other'],
  routing: [
    { node: 'gap-parent', route: 'STATIC', extracted: ['--parity-gap'] },
    { node: 'gap-parent-runtime', route: 'runtime:css-not-literal', runtime: ['css'], whole: true },
    { node: 'gap-child', route: 'STATIC', extracted: ['paddingLeft'] },
    { node: 'gap-child-runtime', route: 'runtime:css-not-literal', runtime: ['css'], whole: true },
    { node: 'fallbacks', route: 'STATIC', extracted: ['--parity-c', 'marginLeft', 'marginRight', 'color'] },
    { node: 'registered', route: 'runtime:at-rule-other', runtime: ['@property --parity-size'], extracted: ['--parity-size'] },
    { node: 'size-child', route: 'STATIC', extracted: ['width'] },
    { node: 'dynamic', route: 'VAR', extracted: ['--parity-step', 'paddingTop', 'outlineOffset'] },
    { node: 'dynamic', route: 'SWITCH', extracted: ['--parity-switch'] },
    { node: 'overrides', route: 'STATIC', extracted: ['--parity-c', 'color'] },
    { node: 'inline', route: 'STATIC', extracted: ['paddingTop'] },
    // The node prop stays in the call as a DOM prop, as the runtime treats it.
    { node: 'top-level', route: 'STATIC', runtime: ['--parity-top'], extracted: ['paddingBottom'] },
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
