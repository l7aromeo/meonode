// At-rule shapes with conditions that hold and fail on purpose (parts/atrule-shapes.ts), rendered on the client only, so static rules and Emotion's insert in the browser.
// Every element's computed style, and the at-rules' text, must match extraction off.
import { createElement, type ReactElement } from 'react'
import { AtruleShapes, MOUNT_STARTING } from './parts/atrule-shapes.js'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: [
    'at.deep',
    'at.nested',
    'at.media',
    'at.supports',
    'at.supports-false',
    'at.container',
    'at.prefers-reduced-motion',
    'at.prefers-color-scheme',
    'at.layer',
    'at.scope',
    'at.starting-style',
    'at.keyframes',
    'at.font-face',
    'at.property',
    'at.vendor',
    'place.css',
    'dyn.state',
    'env.client-only',
  ],
  routes: ['NAMED', 'RUNTIME:not-extractable'],
  routing: [
    { node: 'deep-true', route: 'NAMED' },
    { node: 'deep-selector', route: 'NAMED' },
    { node: 'supports', route: 'NAMED' },
    { node: 'media-features', route: 'NAMED' },
    { node: 'vendor', route: 'NAMED' },
    { node: 'layer-unlayered', route: 'NAMED' },
    { node: 'scope', route: 'NAMED' },
    { node: 'starting', route: 'NAMED' },
    { node: 'keyframes', route: 'NAMED' },
    { node: 'animation-finite', route: 'NAMED' },
    { node: 'animation-infinite', route: 'NAMED' },
    { node: 'font-face', route: 'NAMED' },
    { node: 'property', route: 'NAMED' },
  ],
  breakpoints: [600],
  reducedMotion: true,
  render: 'client',
  steps: [{ name: 'mount a starting-style element', click: MOUNT_STARTING }],
}

export function App(): ReactElement {
  return createElement(AtruleShapes)
}
