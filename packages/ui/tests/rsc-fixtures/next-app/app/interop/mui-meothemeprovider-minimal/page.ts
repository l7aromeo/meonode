'use client'

import { Column, Div, Node, ThemeProvider as MeoThemeProvider, type Theme, Children } from '@meonode/ui'
import { Button, Card, CardContent, Chip, Grid } from '@mui/material'
import { useEffect, useMemo, useState } from 'react'

const lightTheme: Theme = {
  mode: 'light',
  system: {
    primary: { default: 'rgb(255, 107, 107)', content: '#fff' },
    base: { default: '#f8f8f8', content: '#222' },
    neutral: { default: '#eee', content: '#666' },
    secondary: { default: '#fff', content: '#444' },
  },
}

// There is no second theme object any more. A mode is a name, and its palette
// lives in CSS keyed by `[data-theme="…"]`; the provider carries one token map
// of `var(--…)` references, which is what keeps a server-rendered document the
// same for every reader. This fixture is about MUI interop, so it declares the
// two mode names and one map.

const features = ['Daily check-in', 'Redeem codes', 'Profile cards', 'Build showcase']

/**
 * The shape a consumer used to write by hand: read storage, pick a palette, hand
 * the provider a whole theme object.
 *
 * It now picks a *mode* and the provider owns the rest. The provider does this
 * itself — storage, the OS mapping, the pre-paint attribute — so a wrapper like
 * this is no longer how an application chooses; it is kept because what this
 * fixture asserts is MUI interop, not theme selection, and the wrapper is what
 * puts a client boundary between the two providers.
 */
function ThemeLikeWrapper({ children, mode }: { children: Children; mode: string }) {
  const [loadedMode, setLoadedMode] = useState<string>(mode)

  useEffect(() => {
    if (!mode) {
      const stored = localStorage.getItem('theme')
      if (!stored) {
        const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        setLoadedMode(isDark ? 'dark' : 'light')
      } else {
        setLoadedMode(stored)
      }
    }
  }, [mode])

  return MeoThemeProvider({
    modes: ['light', 'dark'],
    defaultMode: loadedMode,
    tokens: lightTheme.system,
    children,
  }).render()
}

export default function Page() {
  const mode = useMemo(() => 'light', [])

  return Node(ThemeLikeWrapper, {
    mode,
    children: Column({
      'data-testid': 'interop-mui-meothemeprovider-page',
      padding: 20,
      gap: 16,
      children: [
        Node(Chip, {
          label: 'MEO THEME + MUI',
          sx: { backgroundColor: 'theme.primary', color: 'theme.primary.content', fontWeight: 700 },
        }),
        Node(Grid, {
          props: {
            container: true,
          },
          spacing: 2,
          children: features.map(title =>
            Node(Grid, {
              size: { xs: 12, md: 6 },
              children: Node(Card, {
                backgroundColor: 'theme.secondary',
                border: '1px solid theme.neutral',
                borderRadius: 8,
                sx: {
                  backgroundColor: 'theme.primary',
                },
                children: Node(CardContent, {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  children: [
                    Div({ children: title }),
                    Node(Button, {
                      variant: 'contained',
                      size: 'small',
                      textTransform: 'none',
                      children: 'Open',
                    }),
                  ],
                }),
              }),
            }),
          ),
        }),
        Node(Button, {
          variant: 'outlined',
          size: 'large',
          textTransform: 'none',
          children: 'Explore Features',
        }),
      ],
    }),
  }).render()
}
