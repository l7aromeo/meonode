import { Div, Input, ThemeProvider } from '@meonode/ui'

// `/theme/nested-provider-key` with a void element as the nested provider's
// direct child: nothing inside the provider can carry its rule in its children.
export default function Page() {
  return Div({
    children: ThemeProvider({
      modes: ['morning', 'night'],
      defaultMode: 'morning',
      tokens: { narrow: { default: '1px' } },
      children: Input({
        'data-testid': 'nested-provider-key-void',
        readOnly: true,
        value: 'void',
        css: { '@media (min-width: theme.narrow)': { color: 'rgb(0, 0, 128)' } },
      }),
    }),
  }).render()
}
