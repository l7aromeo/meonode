// At-rules: @media at a breakpoint, prefers-color-scheme, @container,
// @supports, at-rules nested in at-rules and in selectors, and a theme token
// inside an at-rule key (runtime path in slice 1).
import type { ReactElement } from 'react'
import { Div, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['at.media', 'at.prefers-color-scheme', 'at.container', 'at.supports', 'at.nested', 'at.token-in-key', 'place.css', 'env.ssr-hydrate'],
  routes: ['STATIC', 'runtime:at-rule-token'],
  breakpoints: [600, 900],
}

export function App(): ReactElement {
  return Div({
    containerType: 'inline-size',
    padding: 4,
    css: {
      '@media (min-width: 600px)': {
        padding: 12,
        '@media (min-width: 900px)': { padding: 20 },
        '&:hover': { color: 'rgb(0, 0, 255)' },
      },
      '@media (prefers-color-scheme: dark)': { backgroundColor: 'rgb(20, 20, 20)', color: 'rgb(240, 240, 240)' },
      '@supports (display: grid)': { display: 'grid', gridTemplateColumns: '1fr 1fr' },
      '@media (max-width: theme.breakpoint.md)': { borderBottom: '2px solid rgb(0, 128, 0)' },
    },
    children: [
      Span('a', { key: 'a', css: { '@container (min-width: 500px)': { fontSize: 20 } } }),
      Span('b', { key: 'b', css: { '&:hover': { '@media (min-width: 600px)': { textDecoration: 'underline' } } } }),
    ],
  }).render() as ReactElement
}
