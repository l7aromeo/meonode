'use client'
import { Div, ThemeProvider } from '@meonode/ui'

// `theme.primary.missing` is not in the tokens: development would report it, on
// the server while rendering and again in the browser; a production build must not.
export default function Probe() {
  return ThemeProvider({
    modes: ['light'],
    defaultMode: 'light',
    tokens: { primary: { default: 'rgb(1, 2, 3)' } },
    children: Div({ 'data-testid': 'undefined-token', color: 'theme.primary.missing', children: 'undefined token' }),
  }).render()
}
