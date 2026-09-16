// Fixture 3: theme-tokens
//
// `theme.*` token strings used as style prop values inside a ThemeProvider.
// These are literal strings at the call site (e.g. 'theme.spacing.md'), so
// the compiler buckets them into `c` same as any other literal — the
// runtime's own theme-token-to-CSS-var resolution (replaceThemeTokensWithCssVars)
// is what actually interprets them, identically regardless of whether this
// call site was compiled.
import { Div, ThemeProvider } from '@meonode/ui'

const tokens = {
  primary: '#4f46e5',
  spacing: { md: '16px' },
}

export default function ThemeTokens() {
  return ThemeProvider({
    tokens,
    modes: ['light'],
    defaultMode: 'light',
    children: Div({
      padding: 'theme.spacing.md',
      backgroundColor: 'theme.primary',
      children: 'Themed box',
    }),
  })
}
