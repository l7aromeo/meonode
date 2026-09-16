import { StyleRegistry } from '@meonode/ui/nextjs-registry'
import { ThemeProvider, PortalProvider, PortalHost, Html, Head, Body, Link, themeScript } from '@meonode/ui'
import type { ReactNode } from 'react'

const theme = {
  mode: 'light' as const,
  system: {
    primary: { default: 'rgb(255, 107, 107)', content: '#FFFFFF' },
    // `var(--…)` references rather than colours, which is the shape the mode
    // path is built on: the document carries the reference, the palette behind
    // it lives in CSS keyed by `[data-theme="…"]`, and nothing in the markup
    // moves when the mode does.
    base: { default: 'var(--fixture-base)', content: 'var(--fixture-base-content)' },
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
      // The script first, the stylesheet after it. A script that follows a
      // `<link rel="stylesheet">` cannot run until that sheet has loaded, which
      // is exactly the delay it exists to avoid, so the order is asserted.
      Head({ children: [themeScript(themeModes), Link({ rel: 'stylesheet', href: '/theme-fixture.css' })] }),
      Body({
        children: StyleRegistry({
          children: ThemeProvider({
            // One literal feeds the script and the provider, which is the
            // pattern both are shaped for: two readers of the same declaration
            // cannot disagree about what the modes are.
            ...themeModes,
            tokens: theme.system,
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
