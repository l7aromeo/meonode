// Structural pseudo-classes over named children placed directly, with no
// helper between them and their parent: each child follows its parent's rule,
// so its rule joins the parent's run. Server styles are inline `<style>`
// elements among the rendered siblings until the client moves them, so a
// structural selector counts them before hydration: each child's `<style>`
// must sit where the runtime puts it, or `:first-child`, `:nth-child`, `+`
// and `~` match other elements than with extraction off.
//
// A useId consumer under a named node after a rule renders its id as text: the
// id comes from the component's place in the tree, so a client tree that
// differs from the server's (style slots rendered on one and not the other)
// shows as a hydration error or a different id.
import { useId, type ReactElement } from 'react'
import { Div, Node, Span } from '@meonode/ui'

/** Its own id, as text, in a fixed-width font: two ids of one length then take the same width in every engine. */
function IdText(): ReactElement {
  return Span(`id ${useId()}`, { fontFamily: 'monospace' }).render() as ReactElement
}

/** Every shape, side by side; every node named. */
export function StructuralDirect(): ReactElement {
  return Div({
    children: [
      Div({
        key: 'direct-first',
        css: { '& > :first-child': { color: 'rgb(200, 0, 0)' } },
        children: [Div({ key: 'df-1', padding: 1, children: 'first' }), Div({ key: 'df-2', padding: 2, children: 'second' })],
      }),
      Div({
        key: 'direct-nth',
        css: { '& > :nth-child(2)': { color: 'rgb(0, 160, 0)' } },
        children: [Div({ key: 'dn-1', padding: 1, children: 'first' }), Div({ key: 'dn-2', padding: 2, children: 'second' })],
      }),
      Div({
        key: 'direct-adjacent',
        padding: 1,
        children: [
          Div({ key: 'da-1', css: { '& + *': { color: 'rgb(200, 100, 0)' } }, children: 'before' }),
          Div({ key: 'da-2', padding: 2, children: 'after' }),
        ],
      }),
      Div({
        key: 'direct-general',
        padding: 1,
        children: [
          Div({ key: 'dg-1', css: { '& ~ *': { fontStyle: 'italic' } }, children: 'before' }),
          Div({ key: 'dg-2', padding: 2, children: 'between' }),
          Div({ key: 'dg-3', padding: 3, children: 'after' }),
        ],
      }),
      Div({ key: 'direct-id', padding: 1, children: [Div({ key: 'di-1', padding: 2, children: Node(IdText, { key: 'id' }) })] }),
    ],
  } as never).render() as ReactElement
}
