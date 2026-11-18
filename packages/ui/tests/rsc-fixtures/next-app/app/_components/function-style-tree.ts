import { Div, Span } from '@meonode/ui'

/**
 * The theme a node's `theme` prop gives the nodes under it. In a server
 * component this is the only theme a `css` theme function is called with, since
 * a ThemeProvider's context does not reach the server layer.
 */
const theme = { mode: 'light' as const, system: { spacing: { md: 16 } } }

/**
 * Theme functions in `css` returning a value and returning a whole style, under
 * a node `theme` prop. Rendered by a server page and a client page, which must
 * produce the same classes and the same lengths.
 */
export const functionStyleTree = () =>
  Div({
    theme,
    children: [
      Div({ 'data-testid': 'fn-value', css: { padding: () => 'theme.spacing.md' }, children: 'value' }),
      Div({
        'data-testid': 'fn-style',
        css: { '& > span': () => ({ paddingLeft: 'theme.spacing.md' }) },
        children: Span('style', { 'data-testid': 'fn-style-child' }),
      }),
    ],
  })
