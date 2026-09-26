import { Div, ThemeProvider } from '@meonode/ui'

/**
 * A host tag styled from a server component, with the parts of css that only a
 * stylesheet can express: a pseudo-class, a media query, and a theme token that
 * resolves through a css variable.
 */
export default function Page() {
  return ThemeProvider({
    tokens: { colors: { accent: 'rgb(0, 128, 0)' } },
    modes: ['light', 'dark'],
    defaultMode: 'light',
    children: Div({
      'data-testid': 'hover',
      css: {
        color: 'rgb(106, 4, 15)',
        borderColor: 'theme.colors.accent',
        borderStyle: 'solid',
        borderWidth: 1,
        '&:hover': { color: 'rgb(0, 0, 255)' },
        '@media (min-width: 600px)': { paddingLeft: 17 },
      },
      children: 'hover me',
    }),
  } as never).render()
}
