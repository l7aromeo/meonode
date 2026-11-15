'use client'
import { Div } from '@meonode/ui'

// `theme.primary.missing` is not in the layout's tokens: development reports it,
// on the server while rendering and again in the browser, and production does not.
export default function Page() {
  return Div({ 'data-testid': 'undefined-token', color: 'theme.primary.missing', children: 'undefined token' }).render()
}
