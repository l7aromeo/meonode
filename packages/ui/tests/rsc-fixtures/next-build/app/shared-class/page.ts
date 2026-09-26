import { Div } from '@meonode/ui'
import { wrappedRows } from '../_shared/rows'

/**
 * Several elements sharing each server-compiled class. Every other page uses
 * each class once, so this is the page where an element after the first to use
 * a class has to get that class too.
 */
export default function Page() {
  return Div({ children: [...wrappedRows('first', ['#6a040f', '#6a040f']), ...wrappedRows('second', ['#6a040f', '#9d0208'])] }).render()
}
