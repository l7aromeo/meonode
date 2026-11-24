// Nodes whose selectors can match without the node (:not(&), :is(&, .x),
// :where(&, .x), a list item without &) or need it in the page (:has(&)), in a
// module the unrendered-negation cases import but never render.
import type { ReactElement } from 'react'
import { Div } from '@meonode/ui'

/** Never rendered by the cases that import it. */
export function Unrendered(): ReactElement {
  return Div({
    children: [
      Div({ key: 'not-self', css: { ':not(&)': { letterSpacing: '1px' } }, children: 'not rendered' }),
      Div({ key: 'is-self', css: { ':is(&, .x)': { textTransform: 'uppercase' } }, children: 'not rendered' }),
      Div({ key: 'where-self', css: { ':where(&, .x)': { fontStyle: 'italic' } }, children: 'not rendered' }),
      Div({ key: 'other', paddingLeft: 2, css: { '&, .other': { textDecoration: 'underline' } }, children: 'not rendered' }),
      Div({ key: 'has-self', css: { ':has(&)': { outlineOffset: '5px' } }, children: 'not rendered' }),
    ],
  } as never).render() as ReactElement
}
