import { createElement, type ReactNode } from 'react'
import { Body, Head, Html, Node, Style } from '@meonode/ui'
import { StyleRegistry } from '@meonode/ui/nextjs-registry'
import { Hydrated } from './_shared/hydrated'

/**
 * Where the harness rests the pointer between readings. A probe usually renders
 * at the page origin, where a headless browser may consider the pointer to be,
 * so a reading taken with the pointer anywhere else could see a `:hover` style.
 * Fixed and on top, so the pointer here is over nothing the harness measures.
 */
const PARK = createElement('div', {
  key: 'park',
  'data-park': '',
  style: { position: 'fixed', right: 0, bottom: 0, width: 12, height: 12, zIndex: 2147483647 },
})

export default function RootLayout({ children }: { children: ReactNode }) {
  return Html({
    lang: 'en',
    children: [
      Head({ children: Style({ children: ':root{--palette-surface: rgb(0, 128, 0)} body{margin:0}' }) }),
      Body({ children: StyleRegistry({ children: [Node(Hydrated), children, PARK] }) }),
    ],
  }).render()
}
