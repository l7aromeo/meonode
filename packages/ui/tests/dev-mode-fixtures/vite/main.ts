import { Div, Node, ThemeProvider } from '@meonode/ui'
import { render } from '@meonode/ui/client'

// `theme.primary.missing` is not in the tokens, so a development build warns
// about it and a production build stays silent.
function App() {
  return ThemeProvider({
    modes: ['light'],
    defaultMode: 'light',
    tokens: { primary: { default: 'rgb(1, 2, 3)' } },
    children: Div({ id: 'probe', color: 'theme.primary.missing', children: 'probe' }),
  }).render()
}

render(Node(App), document.getElementById('root')!)
