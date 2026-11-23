// A server component: rendered through Flight on the React Server Components
// layer, then server-rendered from the payload and hydrated from it, as Next
// does. Static styles, tokens, a pseudo-class, a breakpoint and a theme
// function, all on server nodes; the page's ThemeProvider and mode control are
// client components.
import type { ReactElement } from 'react'
import { Div, H2, P, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['env.rsc', 'place.style-props', 'place.css', 'value.token', 'sel.pseudo-class', 'at.media', 'value.theme-fn-top'],
  routes: ['NAMED', 'RUNTIME:dynamic-value'],
  routing: [
    { node: 'card', route: 'NAMED' },
    { node: 'fn', route: 'RUNTIME:dynamic-value' },
  ],
  breakpoints: [600],
  render: 'rsc',
}

export function App(): ReactElement {
  return Div({
    key: 'card',
    padding: 8,
    borderRadius: 'theme.radius',
    color: 'theme.text',
    css: {
      '&:hover': { backgroundColor: 'rgb(240, 250, 240)' },
      '@media (min-width: 600px)': { padding: 16 },
    },
    children: [
      H2('server component', { key: 'title', margin: 0, fontSize: 18 }),
      P('rendered on the server layer', { key: 'body', marginTop: 4 }),
      Span('theme function', { key: 'fn', color: (theme: { system: { primary: { default: string } } }) => theme.system.primary.default } as never),
    ],
  }).render() as ReactElement
}
