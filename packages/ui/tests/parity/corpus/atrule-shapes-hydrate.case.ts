// At-rule shapes with conditions that hold and fail on purpose (parts/atrule-shapes.ts), server-rendered, then hydrated.
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
    'env.ssr-hydrate',
  ],
  routes: ['STATIC', 'runtime:at-rule-other'],
  routing: [
    { node: 'deep-true', route: 'STATIC', extracted: ['@supports (display: grid)'] },
    { node: 'deep-selector', route: 'STATIC', extracted: ['&:not(.parity-none)'] },
    { node: 'supports', route: 'STATIC', extracted: ['@supports (display: grid)', '@supports (display: parity-nothing)', '@supports not (display: grid)'] },
    { node: 'media-features', route: 'STATIC', extracted: ['@media (prefers-reduced-motion: reduce)', '@media (prefers-color-scheme: dark)'] },
    { node: 'vendor', route: 'STATIC', extracted: ['@media (min-width: 1px)', '@supports (display: grid)'] },
    { node: 'layer-unlayered', route: 'runtime:at-rule-other', runtime: ['@layer parity-low'], whole: true },
    { node: 'scope', route: 'runtime:at-rule-other', runtime: ['@scope', '@scope (.scope-root) to (.scope-limit)'], whole: true },
    { node: 'starting', route: 'runtime:at-rule-other', runtime: ['@starting-style', 'backgroundColor'], extracted: ['transition'] },
    { node: 'keyframes', route: 'runtime:at-rule-other', runtime: ['@keyframes parity-pulse'], extracted: ['animation'] },
    { node: 'animation-finite', route: 'runtime:at-rule-other', runtime: ['@keyframes parity-grow'], extracted: ['animation'] },
    { node: 'animation-infinite', route: 'runtime:at-rule-other', runtime: ['@keyframes parity-turn'], extracted: ['animation'] },
    { node: 'font-face', route: 'runtime:at-rule-other', runtime: ['@font-face', 'fontFamily'], whole: true },
    { node: 'property', route: 'runtime:at-rule-other', runtime: ['@property --parity-length'], extracted: ['outlineOffset'] },
  ],
  breakpoints: [600],
  reducedMotion: true,
  steps: [{ name: 'mount a starting-style element', click: MOUNT_STARTING }],
}

export function App(): ReactElement {
  return createElement(AtruleShapes)
}
