// Structural pseudo-classes on the server HTML, for the structural-* cases.
// Server styles are inline `<style>` elements among the rendered siblings
// until the client moves them, so `:first-child`, `:nth-child`, `:last-child`,
// `+` and `~` may match differently before hydration when the number or
// place of those elements differs: Emotion writes one before each styled
// node. Each parent holds an extracted child and a runtime child.
import type { ReactElement } from 'react'
import { Div, Span } from '@meonode/ui'

/** A rule held in a variable, so its node stays on the runtime path. */
const runtimeCss = { '&': { outlineOffset: '1px' } }

/** An extracted child, then a runtime child. */
const children = (prefix: string) => [
  Div({ key: `${prefix}-static`, padding: 2, children: 'extracted child' }),
  Div({ key: `${prefix}-runtime`, css: runtimeCss, children: 'runtime child' }),
]

/** Every shape, side by side. */
export function Structural(): ReactElement {
  return Div({
    children: [
      Div({ key: 'first-child', css: { '& > :first-child': { color: 'rgb(200, 0, 0)' } }, children: children('first') }),
      Div({ key: 'nth-child', css: { '& > :nth-child(2)': { color: 'rgb(0, 160, 0)' } }, children: children('nth') }),
      Div({ key: 'last-child', css: { '& > :last-child': { color: 'rgb(0, 0, 200)' } }, children: children('last') }),
      Div({ key: 'first-of-type', css: { '& > div:first-of-type': { color: 'rgb(120, 0, 120)' } }, children: children('type') }),
      // A sibling rule from the extracted node to the runtime one after it.
      Div({
        key: 'adjacent',
        children: [
          Div({ key: 'adjacent-static', css: { '& + *': { color: 'rgb(200, 100, 0)' }, '& ~ *': { fontStyle: 'italic' } }, children: 'extracted, before' }),
          Div({ key: 'adjacent-runtime', css: runtimeCss, children: 'runtime, after' }),
        ],
      }),
      Span('after every parent', { key: 'tail' }),
    ],
  } as never).render() as ReactElement
}
