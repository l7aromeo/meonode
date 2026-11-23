// Theme tokens: alone, inside composite values, as a numeric token in a length
// property, and theme functions at the top, nested, returning objects and
// reading the mode. A mode switch is a step.
import type { ReactElement } from 'react'
import { Div, P, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: [
    'value.token',
    'value.token-composite',
    'value.number-dual',
    'value.theme-fn-top',
    'value.theme-fn-nested',
    'value.theme-fn-object',
    'value.theme-fn-mode',
    'dyn.mode-switch',
    'place.css',
    'env.ssr-hydrate',
  ],
  routes: ['CARRIER', 'NAMED', 'RUNTIME:css-not-literal', 'RUNTIME:dynamic-value'],
  routing: [
    { node: 'a', route: 'NAMED' },
    { node: 'b', route: 'RUNTIME:dynamic-value' },
    { node: 'd', route: 'RUNTIME:dynamic-value' },
  ],
  steps: [
    { name: 'dark mode', mode: 'dark' },
    { name: 'light again', mode: 'light' },
  ],
}

export function App(): ReactElement {
  return Div({
    color: 'theme.text',
    backgroundColor: 'theme.surface',
    border: '2px solid theme.primary',
    padding: 'calc(theme.space.md * 2)',
    gap: 'theme.gap.md',
    display: 'flex',
    borderRadius: 'theme.radius',
    children: [
      Span('token', { key: 'a', color: 'theme.primary', marginLeft: 'theme.gap.md' }),
      Span('fn', {
        key: 'b',
        color: (theme: { system: { primary: { default: string } } }) => theme.system.primary.default,
        css: {
          '&:hover': { backgroundColor: (theme: { system: { surface: string } }) => theme.system.surface },
        },
      } as never),
      P('object', {
        key: 'c',
        css: (theme: { system: { text: string } }) => ({ color: theme.system.text, margin: 0 }),
      } as never),
      Span('mode', {
        key: 'd',
        fontWeight: (theme: { mode: string }) => (theme.mode === 'dark' ? 700 : 400),
        outlineColor: (theme: { mode: string }) => (theme.mode === 'dark' ? 'rgb(255, 0, 0)' : 'rgb(0, 0, 255)'),
        outlineStyle: 'solid',
      } as never),
    ],
  } as never).render() as ReactElement
}
