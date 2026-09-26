import { createElement, type ReactNode } from 'react'
import { createNode } from '@meonode/ui'

/** A plain server function component: css reaches it as a compiled class name. */
function ServerDiv(props: { children?: ReactNode; className?: string }) {
  return createElement('div', props)
}

const WrappedDiv = createNode(ServerDiv)

/**
 * Distinct per page, so every rule in a response can be attributed to the page
 * that owns it. That is what lets a test tell "this page has its rules" apart
 * from "this page has *a* rule, which belongs to another page".
 */
export const PALETTES = {
  wrapped: ['#123456', '#234567', '#345678', '#456789'],
  dynamicB: ['#a1b2c3', '#b2c3d4', '#c3d4e5', '#d4e5f6'],
} as const

/** #34: rows whose class names come from `compileServerEmotionClassName`. */
export const wrappedRows = (label: string, palette: readonly string[] = PALETTES.wrapped) =>
  palette.map((colour, i) =>
    WrappedDiv({ key: i, css: { color: colour, padding: '4px 8px', '&:hover': { backgroundColor: '#eee' } }, children: `${label} ${i}` }),
  )
