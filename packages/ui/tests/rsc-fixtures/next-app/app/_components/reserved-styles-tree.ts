import { Div, Span } from '@meonode/ui'

const theme = { mode: 'light' as const, system: { spacing: { md: 16 } } }

/**
 * A `styles` key holding no string, which Emotion reserves for serialized
 * styles, at the top of `css`, under a selector, in a `css` array, and beside a
 * token under a node `theme` prop. The key is left out and the declarations
 * beside it render. Rendered by a server page and a client page.
 */
export const reservedStylesTree = () =>
  Div({
    children: [
      Div({ 'data-testid': 'reserved-top', css: { styles: { paddingTop: 4 }, paddingBottom: 8 } as never, children: 'top' }),
      Div({
        'data-testid': 'reserved-nested',
        css: { color: 'navy', '& > span': { styles: { color: 'red' }, paddingLeft: 6 } } as never,
        children: Span('nested', { 'data-testid': 'reserved-nested-child' }),
      }),
      Div({ 'data-testid': 'reserved-array', css: [{ color: 'teal' }, { styles: { marginLeft: 1 }, marginTop: 5 }] as never, children: 'array' }),
      Div({
        theme,
        children: Div({ 'data-testid': 'reserved-themed', css: { styles: { paddingTop: 2 }, paddingRight: 'theme.spacing.md' } as never, children: 'themed' }),
      }),
    ],
  })
