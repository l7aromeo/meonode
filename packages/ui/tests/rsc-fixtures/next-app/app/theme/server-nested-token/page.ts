import { Div, ThemeProvider } from '@meonode/ui'

// A server component rendering a nested provider. `theme.accent` only the nested
// provider defines, `theme.primary` only the root layout's: both render, so
// development reports neither.
export default function Page() {
  return Div({
    children: ThemeProvider({
      modes: ['morning', 'night'],
      defaultMode: 'morning',
      tokens: { accent: { default: 'rgb(0, 0, 255)' } },
      children: [
        Div({ key: 'inner', 'data-testid': 'server-nested-inner', color: 'theme.accent', children: 'inner token' }),
        Div({ key: 'outer', 'data-testid': 'server-nested-outer', color: 'theme.primary', children: 'outer token' }),
      ],
    }),
  }).render()
}
