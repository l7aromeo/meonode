import { Div, ThemeProvider } from '@meonode/ui'

const narrowKey = { '@media (min-width: theme.narrow)': { color: 'rgb(0, 128, 0)' } }

// A server component whose `css` key uses a token only the nested provider
// defines. The host above the provider must not carry its rule: there it would
// resolve against the root layout's provider, which lacks `narrow`.
export default function Page() {
  return Div({
    children: ThemeProvider({
      modes: ['morning', 'night'],
      defaultMode: 'morning',
      tokens: { narrow: { default: '1px' } },
      children: Div({ 'data-testid': 'nested-provider-key-host', css: narrowKey, children: 'nested provider key' }),
    }),
  }).render()
}
