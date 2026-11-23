// Selector and at-rule keys stylis's parse does not keep inside one rule: an
// unterminated :not(, a // that stylis reads as a comment, a ; inside the key,
// and an unterminated attribute quote. The compiler extracts each node, and
// whatever stylis makes of the key must be what both builds render. Emotion
// writes each node's server rules in a <style> of their own, so what one key
// does to the rules after it (an unclosed `(` swallows them) stays inside that
// node's own rule text; extraction must keep it there too.
import type { ReactElement } from 'react'
import { Div, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['sel.not', 'sel.descendant', 'sel.self-attr', 'place.css', 'env.ssr-hydrate'],
  routes: ['NAMED'],
  routing: [
    { node: 'unclosed-not', route: 'NAMED' },
    { node: 'comment', route: 'NAMED' },
    { node: 'semicolon', route: 'NAMED' },
    { node: 'unclosed-quote', route: 'NAMED' },
    { node: 'after', route: 'NAMED' },
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
