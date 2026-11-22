// Selector and at-rule keys stylis's parse does not keep inside one rule: an
// unterminated :not(, a // that stylis reads as a comment, a ; inside the key,
// and an unterminated attribute quote. The compiler leaves each whole node on
// the runtime path, so whatever stylis makes of the key is what both builds
// render. Each node stands alone, so what one key does to the rules after it
// stays inside that node's own rule text.
import type { ReactElement } from 'react'
import { Div, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.not', 'sel.descendant', 'sel.self-attr', 'place.css', 'env.ssr-hydrate'],
  routes: ['STATIC', 'runtime:selector-unsupported'],
  routing: [
    { node: 'unclosed-not', route: 'runtime:selector-unsupported', runtime: ['&:not(.a'], whole: true },
    { node: 'comment', route: 'runtime:selector-unsupported', runtime: ['& //x'], whole: true },
    { node: 'semicolon', route: 'runtime:selector-unsupported', runtime: ['& ;b'], whole: true },
    { node: 'unclosed-quote', route: 'runtime:selector-unsupported', runtime: ['&[data-x="a'], whole: true },
    { node: 'after', route: 'STATIC', extracted: ['color'] },
  ],
}

export function App(): ReactElement {
  return Div({
    children: [
      Div({ key: 'unclosed-not', padding: 2, css: { '&:not(.a': { color: 'rgb(1, 0, 0)' } }, children: Span(':not( unterminated', { key: 's' }) }),
      Div({ key: 'comment', padding: 3, css: { '& //x': { color: 'rgb(2, 0, 0)' } }, children: Span('a // in the key', { key: 's' }) }),
      Div({ key: 'semicolon', padding: 4, css: { '& ;b': { color: 'rgb(3, 0, 0)' } }, children: Span('a ; in the key', { key: 's' }) }),
      Div({ key: 'unclosed-quote', padding: 5, 'data-x': 'a', css: { '&[data-x="a': { color: 'rgb(4, 0, 0)' } }, children: 'an unterminated quote' }),
      Span('after', { key: 'after', color: 'rgb(5, 0, 0)' }),
    ],
  } as never).render() as ReactElement
}
