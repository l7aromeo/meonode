import type { ReactNode } from 'react'
import { Body, Html } from '@meonode/ui'
import { StyleRegistry } from '@meonode/ui/nextjs-registry'

export default function RootLayout({ children }: { children: ReactNode }) {
  return Html({ lang: 'en', children: Body({ children: StyleRegistry({ children }) }) }).render()
}
