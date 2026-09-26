import { Div } from '@meonode/ui'
import { wrappedRows } from '../_shared/rows'

/**
 * Several elements sharing each server-compiled class. Every other page uses
 * each class exactly once, which is how a compile path that answered only the
 * first request for an id — leaving later elements with no class at all — went
 * unnoticed.
 */
export default function Page() {
  return Div({ children: [...wrappedRows('first', ['#6a040f', '#6a040f']), ...wrappedRows('second', ['#6a040f', '#9d0208'])] }).render()
}
