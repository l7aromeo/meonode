import type { ReactNode } from 'react'
import { ThemeProvider } from '@meonode/ui'
import { themeProps } from '../_shared/theme'

// ThemeProvider called straight from a server layout. It is a client component,
// so this reaches the client as a reference with serialised props.
export default function Layout({ children }: { children: ReactNode }) {
  return ThemeProvider({ ...themeProps, modes: [...themeProps.modes], children }).render()
}
