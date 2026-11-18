import { Div, Input, ThemeProvider } from '@meonode/ui'

const narrowKey = { '@media (min-width: theme.narrow)': { color: 'rgb(0, 128, 0)' } }
// Its own colour, so the void element's class and rule are not the host's.
const narrowKeyVoid = { '@media (min-width: theme.narrow)': { color: 'rgb(0, 0, 128)' } }

// A nested provider rendered by a server component, defining a token the layout's
// provider lacks, used in a css key on a host and on a void element directly
// inside it.
export default function Page() {
  return Div({
    children: ThemeProvider({
      modes: ['light'],
      defaultMode: 'light',
      tokens: { narrow: '1px' },
      children: [
        Div({ key: 'host', 'data-nested': 'host', css: narrowKey, children: 'host' }),
        Input({ key: 'void', 'data-nested': 'void', readOnly: true, value: 'void', css: narrowKeyVoid }),
      ],
    }),
  }).render()
}
