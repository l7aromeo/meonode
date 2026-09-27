// @vitest-environment jsdom
//
// Opening a portal changes what `PortalHost` renders. It must not change the
// context every Suspense boundary below the provider sits under: React discards
// the server HTML of a boundary that has not hydrated yet when that context
// changes, so a layer opened while a slow page is still hydrating — from a mount
// effect, say — would replace content the reader is already looking at.
import { act, createElement, lazy, type ReactNode, Suspense, useEffect } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PortalHost, PortalProvider, usePortal } from '@src/main.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Content() {
  return createElement('p', { id: 'content' }, 'server content')
}

function Layer() {
  return createElement('span', { id: 'layer' }, 'layer')
}

/** Opens a layer as soon as it mounts. */
function OpenOnMount() {
  const portal = usePortal()
  useEffect(() => {
    portal.open(Layer as never)
  }, [])
  return null
}

const page = (content: ReactNode) =>
  PortalProvider({
    children: [
      createElement(OpenOnMount, { key: 'open' }),
      createElement(Suspense, { key: 'content', fallback: createElement('p', { id: 'fallback' }, 'loading') }, content),
      PortalHost({ key: 'host' }).render(),
    ],
  } as never).render() as ReactNode

describe('a portal opened while a boundary below the provider is still dehydrated', () => {
  it('opens, and leaves the boundary’s server HTML in place', async () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(page(createElement(Content)))
    document.body.appendChild(container)
    const server = container.querySelector('#content')

    let loadChunk!: () => void
    const chunk = new Promise<{ default: typeof Content }>(resolve => (loadChunk = () => resolve({ default: Content })))
    const LazyContent = lazy(() => chunk)

    let root!: ReturnType<typeof hydrateRoot>
    await act(async () => {
      root = hydrateRoot(container, page(createElement(LazyContent)), { onRecoverableError: () => {} })
    })
    try {
      expect(container.querySelector('#layer')).not.toBeNull()
      expect(container.querySelector('#content')).toBe(server)

      await act(async () => {
        loadChunk()
        await chunk
      })
      expect(container.querySelector('#content')).toBe(server)
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })
})
