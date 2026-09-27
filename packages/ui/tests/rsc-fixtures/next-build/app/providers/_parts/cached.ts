import { Div } from '@meonode/ui'

/** A `'use cache'` function on every provider page: with a client module importing the library, part of what these routes guard. */
export async function Cached() {
  'use cache'
  return Div({ 'data-cached': 'yes', children: 'cached' }).render()
}
