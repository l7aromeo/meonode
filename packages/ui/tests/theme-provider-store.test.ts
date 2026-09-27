// @vitest-environment jsdom
//
// The provider's context never changes with the mode: readers take the mode from
// the provider's store, each on its own. These are the behaviours that rest on
// that, on a hydrated page and on a page rendered in the browser alone.
import { act, createElement, type ReactNode, useContext, useLayoutEffect } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from '@src/main.js'
import { ThemeContext } from '@src/components/theme-provider.client.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TOKENS = { colors: { primary: 'var(--brand-primary)' } }
const MODES = ['morning', 'night'] as const

const provider = (children: ReactNode) => ThemeProvider({ tokens: TOKENS, modes: MODES, defaultMode: 'morning', children } as never).render() as ReactNode

function stubStorage(stored: string | null) {
  const map = new Map<string, string>(stored ? [['theme', stored]] : [])
  vi.stubGlobal('localStorage', { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) })
  if (stored) document.documentElement.setAttribute('data-theme', stored)
  return map
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-theme-preference')
  document.body.innerHTML = ''
})

describe('the provider’s context', () => {
  it('does not change when the reader’s mode is adopted, when it is set, or when the provider renders again', async () => {
    stubStorage('night')
    const values: unknown[] = []
    let setMode!: (mode: string) => void
    function ContextReader() {
      values.push(useContext(ThemeContext))
      return null
    }
    function Setter() {
      setMode = useTheme().setMode as never
      return null
    }
    const tree = () => provider([createElement(ContextReader, { key: 'reader' }), createElement(Setter, { key: 'setter' })])
    const container = document.createElement('div')
    container.innerHTML = renderToString(tree())
    document.body.appendChild(container)
    values.length = 0

    let root!: ReturnType<typeof hydrateRoot>
    await act(async () => {
      root = hydrateRoot(container, tree())
    })
    await act(async () => setMode('morning'))
    await act(async () => root.render(tree()))

    expect(new Set(values).size).toBe(1)
    expect(document.documentElement.getAttribute('data-theme')).toBe('morning')
    act(() => root.unmount())
  })
})

describe('a reader of the mode', () => {
  /** Records every mode and handover flag it renders with. */
  const seen: string[] = []
  function ModeReader() {
    const { mode, hydrated } = useTheme()
    seen.push(`${mode}/${hydrated}`)
    return createElement('span', { id: 'reader', 'data-mode': mode }, mode)
  }

  afterEach(() => {
    seen.length = 0
  })

  it('renders the reader’s mode from its first render when nothing was server-rendered', async () => {
    stubStorage('night')
    const container = document.body.appendChild(document.createElement('div'))
    const root = createRoot(container)
    await act(async () => root.render(provider(createElement(ModeReader))))

    expect(seen).toEqual(['night/true'])
    act(() => root.unmount())
  })

  it('renders the server’s default while hydrating, and the reader’s mode before the browser can paint', async () => {
    stubStorage('night')
    let afterCommit: string | null | undefined

    /**
     * Reads the DOM in a microtask queued by the hydration commit: after the work
     * that commit does synchronously, before the browser's next chance to paint.
     */
    function FirstFrame() {
      useLayoutEffect(() => {
        queueMicrotask(() => {
          afterCommit ??= document.querySelector('#reader')?.getAttribute('data-mode')
        })
      }, [])
      return null
    }
    const tree = () => provider([createElement(ModeReader, { key: 'read' }), createElement(FirstFrame, { key: 'frame' })])
    const container = document.createElement('div')
    container.innerHTML = renderToString(tree())
    document.body.appendChild(container)
    seen.length = 0

    // React's own scheduler rather than `act`, which would run the passive
    // effects of the commit before the microtask.
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
    const root = hydrateRoot(container, tree())
    try {
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(seen).toEqual(['morning/false', 'night/true'])
      expect(afterCommit).toBe('night')
    } finally {
      root.unmount()
      ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    }
  })

  it('takes a mode set before the provider has adopted the reader’s own', async () => {
    const storage = stubStorage('night')
    function SetsOnMount() {
      const { setMode } = useTheme()
      // A child's layout effect runs before its provider's.
      useLayoutEffect(() => setMode('morning'), [])
      return null
    }
    const container = document.body.appendChild(document.createElement('div'))
    const root = createRoot(container)
    await act(async () => root.render(provider([createElement(SetsOnMount, { key: 'set' }), createElement(ModeReader, { key: 'read' })])))

    expect(container.querySelector('#reader')?.getAttribute('data-mode')).toBe('morning')
    expect(document.documentElement.getAttribute('data-theme')).toBe('morning')
    expect(storage.get('theme')).toBe('morning')
    act(() => root.unmount())
  })
})

describe('the document’s theme attributes', () => {
  it('are asserted again when the provider renders after something removed them', async () => {
    stubStorage('night')
    const container = document.body.appendChild(document.createElement('div'))
    const root = createRoot(container)
    await act(async () => root.render(provider(null)))
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-theme-preference')

    await act(async () => root.render(provider(null)))

    expect(document.documentElement.getAttribute('data-theme')).toBe('night')
    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('night')
    act(() => root.unmount())
  })
})
