// @vitest-environment jsdom
//
// The one case where React's development key check misreads a node given as a
// positional child. The element a node renders for that check is held only until
// the end of the current task (see `BaseNode#status`). A concurrent render that
// yields between creating the parent element and reconciling its children
// outlives the hold, so React checks a freshly rendered element and reports a
// missing key once. Development only, and only in a render that yields there.
import { Node, Span } from '@src/main.js'
import { createElement, startTransition, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

/** React's scheduler yields once a render has run for 5 ms. */
const PAST_A_FRAME_MS = 12

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
let previousActEnvironment: boolean | undefined

beforeEach(() => {
  // `act` would render synchronously and never yield; this needs React's own scheduler.
  previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

afterEach(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  vi.restoreAllMocks()
})

async function keyWarningsIn(render: (container: HTMLElement) => void): Promise<{ text: string; warnings: number }> {
  const errors: string[] = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(String(args[0])))
  const container = document.createElement('div')
  document.body.append(container)
  render(container)
  await new Promise(resolve => setTimeout(resolve, 200))
  container.remove()
  return { text: container.textContent ?? '', warnings: errors.filter(error => error.includes('unique "key"')).length }
}

/** Renders `slot` as a positional child, after keeping the render busy for `busyMs`. */
const busyParent =
  (busyMs: number) =>
  ({ slot }: { slot?: ReactNode }) => {
    const element = createElement('header', null, slot, 'after')
    const end = performance.now() + busyMs
    while (performance.now() < end) {
      // Hold the render past the scheduler's time slice.
    }
    return element
  }

it('reports one missing key when a transition yields between the parent and its children', async () => {
  const Busy = busyParent(PAST_A_FRAME_MS)
  const { text, warnings } = await keyWarningsIn(container => startTransition(() => createRoot(container).render(Node(Busy, { slot: Span('y') }).render())))
  expect(text).toBe('yafter')
  expect(warnings).toBe(1)
})

it('reports none when the same transition does not yield', async () => {
  const Quick = busyParent(0)
  const { text, warnings } = await keyWarningsIn(container => startTransition(() => createRoot(container).render(Node(Quick, { slot: Span('y') }).render())))
  expect(text).toBe('yafter')
  expect(warnings).toBe(0)
})
