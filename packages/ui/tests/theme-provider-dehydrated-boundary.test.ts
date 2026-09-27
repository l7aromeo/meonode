// @vitest-environment jsdom
//
// A Suspense boundary below the provider can still be dehydrated when the
// provider hydrates: its client chunk has not loaded, so hydrating it suspends,
// or the server is still streaming its content. React discards such a boundary's
// server HTML and client-renders it when a context above it changes before it
// has hydrated — at any priority for a boundary still streaming, and at anything
// but a transition for one whose hydration suspends. Whatever the provider does
// when it adopts the reader's mode must not change the context those boundaries
// sit under, or a slow load replaces the content the reader is already looking
// at, and loses its scroll position and state.
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { act, createElement, lazy, type ReactNode, Suspense, use } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Div, ThemeProvider } from '@src/main.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TOKENS = { colors: { primary: 'var(--brand-primary)' } }
const MODES = ['morning', 'night'] as const

function Content() {
  return createElement('p', { id: 'content' }, 'server content')
}

/** The page: the provider at the root, the content in a boundary of its own. */
const page = (content: ReactNode) =>
  ThemeProvider({
    tokens: TOKENS,
    modes: MODES,
    defaultMode: 'morning',
    children: createElement(Suspense, { fallback: createElement('p', { id: 'fallback' }, 'loading') }, content),
  } as never).render() as ReactNode

/**
 * Hydrates the page with the content's client chunk still loading, then loads it.
 * @returns The content element before hydration, while the chunk loads, and after.
 */
async function hydrateWithPendingChunk(stored: string | null) {
  const container = document.createElement('div')
  container.innerHTML = renderToString(page(createElement(Content)))
  document.body.appendChild(container)
  const server = container.querySelector('#content')

  const map = new Map<string, string>(stored ? [['theme', stored]] : [])
  vi.stubGlobal('localStorage', { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) })
  if (stored) document.documentElement.setAttribute('data-theme', stored)

  let loadChunk!: () => void
  const chunk = new Promise<{ default: typeof Content }>(resolve => (loadChunk = () => resolve({ default: Content })))
  const LazyContent = lazy(() => chunk)

  let root!: ReturnType<typeof hydrateRoot>
  await act(async () => {
    root = hydrateRoot(container, page(createElement(LazyContent)), { onRecoverableError: () => {} })
  })
  const whileLoading = container.querySelector('#content')
  await act(async () => {
    loadChunk()
    await chunk
  })
  const after = container.querySelector('#content')
  return {
    server,
    whileLoading,
    after,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-theme-preference')
})

describe('a boundary still dehydrated when the provider adopts the reader’s mode', () => {
  it.each([
    ['nothing is stored', null],
    ['a mode other than the default is stored', 'night'],
  ])('keeps its server HTML when %s', async (_, stored) => {
    const { server, whileLoading, after, cleanup } = await hydrateWithPendingChunk(stored)
    try {
      expect(server).not.toBeNull()
      expect(whileLoading).toBe(server)
      expect(after).toBe(server)
    } finally {
      cleanup()
    }
  })
})

function stubStored(stored: string) {
  const map = new Map([['theme', stored]])
  vi.stubGlobal('localStorage', { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) })
  document.documentElement.setAttribute('data-theme', stored)
}

describe('a boundary whose content the server is still streaming when the provider adopts the reader’s mode', () => {
  /** React's own markup for a pending boundary, and the chunk that completes it. */
  const streamed = JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, '_suspense-stream.mjs')], { encoding: 'utf8' })) as {
    boundary: string
    completion: string
  }
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  function StreamedContent({ data }: { data: Promise<string> }) {
    return createElement('p', { id: 'content' }, use(data))
  }

  it.each([
    ['directly below the provider', (boundary: ReactNode) => boundary],
    [
      'inside an element styled from the mode, which re-renders as the reader’s mode is adopted',
      (boundary: ReactNode) => Div({ css: { color: (theme: { mode: string }) => (theme.mode === 'night' ? 'navy' : 'gold') }, children: boundary }).render(),
    ],
  ])('hydrates the content the server streamed, rather than rendering its own, %s', async (_, wrap) => {
    // The document is still loading while the stream is open; React client-renders
    // a boundary still pending once it is not.
    let readyState: DocumentReadyState = 'loading'
    const readyStateDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'readyState')
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => readyState })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false

    const container = document.createElement('div')
    stubStored('night')
    const streamPage = (content: ReactNode) =>
      ThemeProvider({
        tokens: TOKENS,
        modes: MODES,
        defaultMode: 'morning',
        children: wrap(createElement(Suspense, { fallback: createElement('p', { id: 'fallback' }, 'loading') }, content)),
      } as never).render() as ReactNode
    container.innerHTML = renderToString(streamPage(createElement('i', { id: 'slot' }))).replace('<!--$--><i id="slot"></i><!--/$-->', streamed.boundary)
    document.body.appendChild(container)
    let resolveData!: (text: string) => void
    const data = new Promise<string>(resolve => (resolveData = resolve))
    const root = hydrateRoot(container, streamPage(createElement(StreamedContent, { data })), { onRecoverableError: () => {} })
    try {
      await wait(30)
      expect(container.querySelector('template')).not.toBeNull()

      const holder = document.createElement('div')
      holder.innerHTML = streamed.completion
      let serverContent: Element | null = null
      for (const node of [...holder.childNodes]) {
        if (node.nodeName === 'SCRIPT') new Function((node as HTMLScriptElement).text)()
        else serverContent = (document.body.appendChild(node) as Element).querySelector('#content')
      }
      // React reveals a streamed boundary after a short batching delay.
      await wait(600)
      readyState = 'complete'
      resolveData('streamed')
      await data
      await wait(30)

      expect(serverContent).not.toBeNull()
      expect(container.querySelector('#content')).toBe(serverContent)
    } finally {
      root.unmount()
      container.remove()
      document.querySelectorAll('[id^="S:"]').forEach(node => node.remove())
      if (readyStateDescriptor) delete (document as { readyState?: unknown }).readyState
      ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    }
  })
})
