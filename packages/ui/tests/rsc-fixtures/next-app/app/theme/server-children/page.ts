import { ThemeProvider } from '@meonode/ui'
import { ThemeScopeBlock } from '../../_components/theme-scope-block'

export default function Page() {
  return ThemeProvider({
    modes: ['light'],
    defaultMode: 'light',
    tokens: {
      primary: { default: 'rgb(0, 128, 0)' },
    },
    children: ThemeScopeBlock({
      pageTestId: 'theme-children-page',
      innerTestId: 'theme-children-inner',
      text: 'themed-from-server',
    }),
  }).render()
}
