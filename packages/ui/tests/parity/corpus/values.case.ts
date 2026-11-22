// Value shapes with static values: numbers with and without units, strings,
// templates, !important, custom properties (in css, and at the top level,
// where a --name is a DOM prop), omitted values, fallback arrays.
import type { ReactElement } from 'react'
import { Div, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: [
    'value.number-length',
    'value.number-unitless',
    'value.string',
    'value.template-static',
    'value.important',
    'value.custom-property',
    'value.omitted',
    'value.fallback-array',
    'place.not-css-prop',
    'place.style-props',
    'place.css',
    'env.ssr-hydrate',
  ],
  routes: ['STATIC', 'runtime:array-value'],
  routing: [
    { node: 'root', route: 'STATIC', extracted: ['padding', 'width', 'opacity', 'backgroundColor'] },
    { node: 'root', route: 'runtime:array-value', runtime: ['position'] },
    { node: 'root', route: 'STATIC', extracted: ['--parity-inner', 'textIndent'], runtime: ['--parity-local'] },
    { node: 'a', route: 'STATIC', extracted: ['margin', 'borderRadius'] },
  ],
}

const BORDER = 2

export function App(): ReactElement {
  return Div({
    key: 'root',
    padding: 8,
    width: 240,
    marginTop: -4,
    opacity: 0.75,
    flexGrow: 1,
    zIndex: 2,
    lineHeight: 1.5,
    fontWeight: 600,
    display: 'block',
    color: 'rgb(10, 20, 30)',
    borderStyle: `solid`,
    borderWidth: `${BORDER}px`,
    backgroundColor: 'rgb(240, 240, 240) !important',
    '--parity-local': '3px',
    outlineOffset: 'var(--parity-local)',
    textDecoration: null,
    letterSpacing: undefined,
    wordSpacing: false,
    css: {
      position: ['-webkit-sticky', 'sticky'],
      top: 0,
      fontSize: 14,
      transform: 'translateX(1px) rotate(0.5deg)',
      '--parity-inner': '2px',
      textIndent: 'var(--parity-inner)',
    },
    children: [Span('values', { key: 'a', margin: '0 4px', borderRadius: 3 }), Span('more', { key: 'b', padding: '1px 2px 3px 4px', flexShrink: 1 })],
  } as never).render() as ReactElement
}
