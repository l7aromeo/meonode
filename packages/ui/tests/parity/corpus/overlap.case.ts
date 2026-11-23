// Property pairs on one node, by the spec's overlap tables. Pairs that do not
// overlap extract together: border with borderRadius, flex with
// flexDirection, outline with outlineOffset, overflow with overflowWrap,
// paddingBlock with paddingInline, marginBlockStart with marginInlineEnd, and
// --a with --a-b. Pairs that do overlap stay on the runtime path, where their
// order is kept: border with borderColor, marginBottom with marginInline (which
// meet in vertical writing modes), WebkitBackgroundClip with backgroundClip,
// and wordWrap with overflowWrap. The logical pairs also run under
// writing-mode: vertical-rl.
import type { ReactElement } from 'react'
import { Div, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.style-props', 'value.string', 'value.custom-property', 'place.css', 'env.ssr-hydrate'],
  routes: ['CARRIER', 'NAMED'],
  routing: [
    { node: 'border-radius', route: 'CARRIER' },
    { node: 'flex', route: 'NAMED' },
    { node: 'outline', route: 'NAMED' },
    { node: 'overflow', route: 'NAMED' },
    { node: 'block-inline', route: 'NAMED' },
    { node: 'start-end', route: 'NAMED' },
    { node: 'vertical', route: 'NAMED' },
    { node: 'custom', route: 'NAMED' },
    { node: 'border-color', route: 'NAMED' },
    { node: 'bottom-inline', route: 'NAMED' },
    { node: 'bottom-inline-vertical', route: 'NAMED' },
    { node: 'clip', route: 'NAMED' },
    { node: 'wrap', route: 'NAMED' },
  ],
}

export function App(): ReactElement {
  return Div({
    children: [
      Div({ key: 'border-radius', border: '2px solid rgb(0, 0, 0)', borderRadius: 8, children: 'border, borderRadius' }),
      Div({ key: 'flex', css: { flex: '1 1 auto', flexDirection: 'column', gap: 2 }, children: [Span('a', { key: 'a' }), Span('b', { key: 'b' })] }),
      Div({ key: 'outline', outline: '2px dashed rgb(0, 0, 160)', outlineOffset: 3, children: 'outline, outlineOffset' }),
      Div({ key: 'overflow', css: { overflow: 'hidden', overflowWrap: 'anywhere', width: 80 }, children: 'overflow with a longwordthatmustwrapsomewhere' }),
      Div({ key: 'block-inline', paddingBlock: 4, paddingInline: 12, children: 'paddingBlock, paddingInline' }),
      Div({ key: 'start-end', marginBlockStart: 6, marginInlineEnd: 20, children: 'marginBlockStart, marginInlineEnd' }),
      Div({
        key: 'vertical-host',
        writingMode: 'vertical-rl',
        height: 160,
        children: [
          Div({ key: 'vertical', paddingBlock: 4, paddingInline: 12, children: 'vertical' }),
          Div({ key: 'bottom-inline-vertical', marginBottom: 5, marginInline: 9, children: 'vertical margins' }),
        ],
      }),
      Div({ key: 'custom', css: { '--a': '4px', '--a-b': '9px', paddingLeft: 'var(--a-b)', paddingRight: 'var(--a)' }, children: '--a, --a-b' }),
      Div({ key: 'border-color', border: '2px solid rgb(0, 0, 0)', borderColor: 'rgb(200, 0, 0)', children: 'border, borderColor' }),
      Div({ key: 'bottom-inline', marginBottom: 5, marginInline: 9, children: 'marginBottom, marginInline' }),
      Div({
        key: 'clip',
        background: 'linear-gradient(90deg, rgb(200, 0, 0), rgb(0, 0, 200))',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        children: 'clipped text',
      } as never),
      Div({ key: 'wrap', width: 60, wordWrap: 'break-word', overflowWrap: 'normal', children: 'wordWrapthenoverflowWrap' } as never),
    ],
  } as never).render() as ReactElement
}
