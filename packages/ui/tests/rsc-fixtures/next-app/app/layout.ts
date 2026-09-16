import { StyleRegistry } from '@meonode/ui/nextjs-registry'
import { ThemeProvider, PortalProvider, PortalHost, Html, Head, Body, themeScript } from '@meonode/ui'
import type { ReactNode } from 'react'

const theme = {
  mode: 'light' as const,
  system: {
    primary: { default: 'rgb(255, 107, 107)', content: '#FFFFFF' },
    base: { default: '#F8F8F8', content: '#333333' },
    spacing: { sm: 8, md: 16, lg: 24 },
    breakpoint: { md: '1024px' },
  },
}

/**
 * The application's own mode names, which is all the pre-paint script is given.
 * Nothing about `morning` or `night` is known to the library; the mapping is
 * what says which of them the OS means by `dark`.
 */
const themeModes = {
  modes: ['morning', 'night'],
  defaultMode: 'morning',
  system: { light: 'morning', dark: 'night' },
} as const

export default function RootLayout({ children }: { children: ReactNode }) {
  return Html({
    // The script writes `data-theme` on this element before the first paint, so
    // the served markup and the hydrating DOM differ here by design.
    suppressHydrationWarning: true,
    children: [
      Head({ children: themeScript(themeModes) }),
      Body({
        children: StyleRegistry({
          children: ThemeProvider({
            theme,
            children: PortalProvider({
              children: [children, PortalHost()],
            }),
          }),
        }),
      }),
    ],
  }).render()
}

export const metadata = {
  title: 'MeoNode RSC Fixture',
}
