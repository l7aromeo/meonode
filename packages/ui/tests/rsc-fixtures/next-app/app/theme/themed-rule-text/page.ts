import { Div } from '@meonode/ui'

// A server component's css with theme tokens in its keys, in shapes whose rules
// Emotion's development build writes in the browser with an empty rule for each
// parent selector, and on the server without: the text of a `ThemedRule` differs
// between the two.
export default function Page() {
  return Div({
    'data-testid': 'themed-rule-text',
    'data-size': '1024px',
    css: {
      '@media (min-width: theme.breakpoint.md)': { color: 'rgb(0, 128, 0)', '&:hover': { color: 'rgb(0, 0, 255)' } },
      '&[data-size="theme.breakpoint.md"]': { '& .a': { letterSpacing: '3px' }, '.dark &': { opacity: 0.5 } },
      '@container (min-width: theme.breakpoint.md)': { backgroundColor: 'rgb(0, 0, 255)' },
    },
    children: 'themed rule text',
  }).render()
}
