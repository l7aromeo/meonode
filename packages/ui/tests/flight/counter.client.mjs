'use client'
// A client component whose only job is to hold state, so a test can tell whether
// React kept it across renders.
import { createElement, useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return createElement('button', { type: 'button', onClick: () => setCount(count + 1) }, `count ${count}`)
}
