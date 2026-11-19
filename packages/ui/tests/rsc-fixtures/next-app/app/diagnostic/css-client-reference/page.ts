import { Div } from '@meonode/ui'
import { ClientStyledBox } from '../../_components/client-styled-box'

// A styled component imported from a client module arrives in a server component
// as a client reference, not as the component. Development rejects it, naming
// where it sits.
export default function Page() {
  return Div({ 'data-testid': 'css-client-reference', css: { color: 'navy', '&:hover': ClientStyledBox } as never, children: 'x' }).render()
}
