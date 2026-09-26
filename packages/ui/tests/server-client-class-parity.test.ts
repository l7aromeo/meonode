// @vitest-environment jsdom
//
// A node with `css` must produce the same classes on the server and the client,
// or React reports an attribute mismatch it never patches. This checks it for a
// plain `renderToString` + `hydrateRoot` app, with no `StyleRegistry` or Emotion
// `CacheProvider` above the tree: a host element, and a function component that
// receives its class and applies it itself.
//
// The server pass runs with `NodeUtil.isServer` set, which is the one switch the
// runtime reads to take its server branch; every read of it happens at render
// time. Class names are content hashes plus the cache key, so they come out the
// same as a window-less server render's.
import { createElement, type ReactNode } from 'react'
import { act } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNode, Div } from '@src/main.js'
import { NodeUtil } from '@src/util/node.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** A function component that receives its class and applies it itself. */
const Card = createNode(function Card({ className, children }: { className?: string; children?: ReactNode }) {
  return createElement('section', { className, 'data-testid': 'card' }, children)
})

const HYDRATION_MARKERS = [/did not match/i, /hydration failed/i, /server rendered/i, /text content does not match/i, /server html/i, /#418/]

/** Collects console errors and uncaught hydration reports while `run` executes. */
async function captureErrors(run: () => Promise<void>): Promise<string[]> {
  const messages: string[] = []
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void messages.push(args.map(String).join(' ')))
  try {
    await run()
  } finally {
    errorSpy.mockRestore()
  }
  return messages.filter(m => HYDRATION_MARKERS.some(re => re.test(m)))
}

/** The classes of every `[data-testid]` element in `container`, in document order. */
const classesIn = (container: Element) => [...container.querySelectorAll('[data-testid]')].map(el => el.className)

/**
 * Server-renders `server()` and hydrates `client()` over it, returning the
 * hydration errors, the server's classes, and the classes a client-only render of
 * `client()` produces. The last come from their own root: after a mismatch React
 * keeps the server's attributes, so the hydrated DOM cannot show what the client
 * rendered.
 */
async function roundTrip(server: () => ReactNode, client: () => ReactNode = server) {
  NodeUtil.isServer = true
  let html: string
  try {
    html = renderToString(server())
  } finally {
    NodeUtil.isServer = false
  }
  const hydrated = document.createElement('div')
  hydrated.innerHTML = html
  document.body.appendChild(hydrated)
  const serverClasses = classesIn(hydrated)
  let hydratedRoot: ReturnType<typeof hydrateRoot> | undefined
  const errors = await captureErrors(async () => {
    await act(async () => {
      hydratedRoot = hydrateRoot(hydrated, client(), { onRecoverableError: error => console.error(String(error)) })
    })
  })

  const fresh = document.createElement('div')
  document.body.appendChild(fresh)
  const freshRoot = createRoot(fresh)
  await act(async () => freshRoot.render(client()))
  const clientClasses = classesIn(fresh)

  await act(async () => {
    hydratedRoot?.unmount()
    freshRoot.unmount()
  })
  hydrated.remove()
  fresh.remove()
  return { errors, serverClasses, clientClasses }
}

afterEach(() => {
  NodeUtil.isServer = false
})

describe('server and client agree on emotion class names without a registry', () => {
  it('reports a planted mismatch, so a clean result below means something', async () => {
    const { errors } = await roundTrip(
      () => Div({ 'data-testid': 'plain', children: 'server' }).render(),
      () => Div({ 'data-testid': 'plain', children: 'client' }).render(),
    )
    expect(errors.length).toBeGreaterThan(0)
  })

  it('hydrates a host element with css cleanly', async () => {
    const { errors, serverClasses, clientClasses } = await roundTrip(() => Div({ 'data-testid': 'host', padding: 8, children: 'x' }).render())
    expect(clientClasses).toEqual(serverClasses)
    expect(errors).toEqual([])
  })

  it('hydrates a function component with css cleanly', async () => {
    const { errors, serverClasses, clientClasses } = await roundTrip(() => Card({ padding: 8, children: 'x' } as never).render())
    expect(clientClasses).toEqual(serverClasses)
    expect(errors).toEqual([])
  })
})
