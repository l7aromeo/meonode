import { Div } from '@meonode/ui'

// An Emotion component selector, as plain JavaScript can pass one as `css`.
// `@emotion/styled` cannot load in a server component, so this is the shape
// Emotion marks one with. Development rejects it, naming where it sits.
const selector = { __emotion_styles: [], toString: () => '' }

export default function Page() {
  return Div({ 'data-testid': 'css-component-selector', css: { '&:hover': selector } as never, children: 'x' }).render()
}
