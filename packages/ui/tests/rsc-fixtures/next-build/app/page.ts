import { Div } from '@meonode/ui'

/** #35: an intrinsic node with a nested selector, as the issue's reproduction. */
export default function Page() {
  return Div({ children: 'Hello', padding: 16, color: 'rebeccapurple', css: { '&:hover': { color: 'crimson' } } }).render()
}
