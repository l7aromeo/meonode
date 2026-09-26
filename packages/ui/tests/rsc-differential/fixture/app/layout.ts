import type { ReactNode } from 'react'
import { Body, Head, Html, Node, Style } from '@meonode/ui'
import { StyleRegistry } from '@meonode/ui/nextjs-registry'
import { Hydrated } from './_shared/hydrated'

export default function RootLayout({ children }: { children: ReactNode }) {
  return Html({
    lang: 'en',
    children: [
      Head({ children: Style({ children: ':root{--palette-surface: rgb(0, 128, 0)} body{margin:0}' }) }),
      Body({ children: StyleRegistry({ children: [Node(Hydrated), children] }) }),
    ],
  }).render()
}
