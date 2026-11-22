// Renders a component a few times and sorts what React and MeoNode logged about
// keys, for the spread-children cases. Each case runs in its own file: React
// reports a missing key once per parent name and process.
import { act, createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { vi } from 'vitest'
import { __resetGeneratedListReport } from '@src/util/generated-list.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Whether the run compiles the test sources. */
export const COMPILED = process.env.MEONODE_COMPILED === '1'

/** What was logged, by who logged it. */
export interface Logged {
  /** React's missing-key warnings. */
  react: string[]
  /** MeoNode's report of an unkeyed list generated at runtime. */
  runtime: string[]
  /** MeoNode's note beside React's warning for a marked list. */
  hint: string[]
}

/** Renders `page(count)` once for each count, on one root, and returns what was logged. */
export function logged(page: (count: number) => unknown, counts: number[]): Logged {
  __resetGeneratedListReport()
  const messages: string[] = []
  const record = (...args: unknown[]) => void messages.push(args.map(String).join(' '))
  const error = vi.spyOn(console, 'error').mockImplementation(record)
  const warn = vi.spyOn(console, 'warn').mockImplementation(record)
  try {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    let count = counts[0]
    const Page = () => page(count) as ReactElement
    for (const next of counts) {
      count = next
      act(() => root.render(createElement(Page)))
    }
    act(() => root.unmount())
  } finally {
    error.mockRestore()
    warn.mockRestore()
  }
  return {
    react: messages.filter(m => m.includes('unique "key" prop')),
    runtime: messages.filter(m => m.startsWith('[MeoNode] A `children` list without keys')),
    hint: messages.filter(m => m.startsWith('[MeoNode] A generated list')),
  }
}
