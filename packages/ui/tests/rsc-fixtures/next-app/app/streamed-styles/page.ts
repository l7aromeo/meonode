import { createElement, Suspense } from 'react'
import { Div, Span } from '@meonode/ui'
import StreamedStyles from '../_components/streamed-styles'

/** How long the boundary's content waits, so the shell is sent before it. */
const STREAM_DELAY_MS = 400

/**
 * The boundary's content: a server element styled as a client element below it
 * is, so the two classes can be compared, and the client content itself.
 */
async function Delayed() {
  await new Promise(resolve => setTimeout(resolve, STREAM_DELAY_MS))
  return [
    Div({
      key: 'twin',
      'data-testid': 'streamed-server-twin',
      marginTop: 5,
      children: Span('deep', { 'data-testid': 'streamed-server-deep', paddingLeft: 7 }),
    }).render(),
    createElement(StreamedStyles, { key: 'client' }),
  ]
}

export default function StreamedStylesPage() {
  return Div({
    'data-testid': 'streamed-styles-page',
    children: createElement(Suspense, { fallback: Span('loading', { 'data-testid': 'streamed-fallback' }).render() }, createElement(Delayed)),
  }).render()
}
