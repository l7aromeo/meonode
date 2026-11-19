'use client'
import { useState } from 'react'
import { Button, Div, Span } from '@meonode/ui'

/**
 * The component `rsc-fast-refresh.test.ts` edits while the page is open: the test
 * rewrites the style values below, so keep them on lines of their own.
 */
export default function RefreshEdited() {
  const [count, setCount] = useState(0)
  return Div({
    'data-testid': 'refresh-edited',
    paddingLeft: 11,
    color: 'rgb(0, 0, 11)',
    children: [
      Button(`count ${count}`, { key: 'b', 'data-testid': 'refresh-counter', onClick: () => setCount(count + 1), margin: 2 }),
      Span('child', { key: 's', 'data-testid': 'refresh-child', marginLeft: 3 }),
    ],
  }).render()
}
