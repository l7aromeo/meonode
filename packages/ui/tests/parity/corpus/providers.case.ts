// Nested and sibling ThemeProviders inside the page's own, each adding tokens
// of its own, read by styles below them; and disableEmotion on a subtree.
import type { ReactElement } from 'react'
import { Div, Span, ThemeProvider } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['dyn.nested-providers', 'place.disable-emotion', 'value.token', 'env.ssr-hydrate'],
  routes: ['STATIC', 'runtime:node-prop'],
  routing: [{ node: 'off', route: 'runtime:node-prop', runtime: ['padding', 'color'] }],
  steps: [{ name: 'dark mode', mode: 'dark' }],
}

const inner = (key: string, tokens: object, label: string) =>
  ThemeProvider({
    key,
    modes: ['light', 'dark'],
    defaultMode: 'light',
    tokens,
    children: Span(label, { color: 'theme.accentA', borderBottom: '2px solid theme.accentB' }),
  } as never)

export function App(): ReactElement {
  return Div({
    padding: 4,
    children: [
      inner('nested', { accentA: 'rgb(150, 0, 0)', accentB: 'rgb(0, 0, 150)' }, 'nested provider'),
      inner('sibling', { accentA: 'rgb(150, 0, 0)', accentB: 'rgb(0, 0, 150)' }, 'sibling provider'),
      Div({ key: 'off', disableEmotion: true, padding: 10, color: 'rgb(255, 0, 0)', children: Span('emotion disabled', { margin: 5 }) }),
    ],
  } as never).render() as ReactElement
}
