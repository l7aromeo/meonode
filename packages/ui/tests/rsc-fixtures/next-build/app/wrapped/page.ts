import { Div } from '@meonode/ui'
import { wrappedRows } from '../_shared/rows'

/** #34, static: prerendered at build time. */
export default function Page() {
  return Div({ children: wrappedRows('static row') }).render()
}
