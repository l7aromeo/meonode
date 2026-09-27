// @vitest-environment jsdom
//
// A css theme function is handed the theme, and may read `theme.mode`. The
// element it styles follows the reader's mode: after hydration, and after
// `setMode`. Only such an element re-renders when the mode changes; one whose
// css holds no function never does, so nothing it wraps is disturbed.
import { act, createElement, lazy, Profiler, type ReactNode, Suspense, useEffect, useLayoutEffect } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Div, Node, ThemeProvider, useTheme } from '@src/main.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TOKENS = { colors: { primary: 'var(--brand-primary)' } }
const MODES = ['morning', 'night'] as const
const NIGHT = 'rgb(0, 0, 1)'
const MORNING = 'rgb(0, 0, 2)'

const byMode = { color: (theme: { mode: string }) => (theme.mode === 'night' ? NIGHT : MORNING) }

let setMode!: (mode: string) => void
function Setter() {
  setMode = useTheme().setMode as never
  return null
}

let content: () => ReactNode = () => null
/** Renders whatever the current test hands `page`, as one component type every render. */
function Page() {
  return content() as never
}

/** The page, below a component boundary so nothing is resolved as the provider's own props. */
const page = (children: () => ReactNode) => {
  content = children
  return ThemeProvider({
    tokens: TOKENS,
    modes: MODES,
    defaultMode: 'morning',
    children: [createElement(Setter, { key: 'setter' }), Node(Page, { key: 'page' })],
  } as never).render() as ReactNode
}

function stubStorage(stored: string) {
  const map = new Map([['theme', stored]])
  vi.stubGlobal('localStorage', { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) })
  document.documentElement.setAttribute('data-theme', stored)
}

/**
 * The colour the element's own class sets, read from the rule Emotion wrote for
 * it. Emotion keeps one cache for the whole file, so a class written by an
 * earlier test is not written again: every rule stays in the document.
 */
const colorOf = (id: string) => {
  const className = document
    .getElementById(id)
    ?.className.split(' ')
    .find(name => name.startsWith('css-'))
  const rules = [...document.querySelectorAll('style')].map(node => node.textContent ?? '').join('')
  return new RegExp(`\\.${className}\\{[^}]*color:([^;}]+)`).exec(rules)?.[1] ?? null
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-theme-preference')
  document.body.innerHTML = ''
})

async function hydrate(children: () => ReactNode) {
  const container = document.createElement('div')
  container.innerHTML = renderToString(page(children))
  document.body.appendChild(container)
  let root!: ReturnType<typeof hydrateRoot>
  await act(async () => {
    root = hydrateRoot(container, page(children), { onRecoverableError: () => {} })
  })
  return { container, root }
}

describe('a css theme function reading `theme.mode`', () => {
  it('styles its element for the reader’s mode after hydration, and follows setMode', async () => {
    stubStorage('night')
    const { root } = await hydrate(() => Div({ id: 'styled', css: byMode, children: 'x' }).render())

    expect(colorOf('styled')).toBe(NIGHT)
    await act(async () => setMode('morning'))
    expect(colorOf('styled')).toBe(MORNING)
    act(() => root.unmount())
  })

  it('styles its element for the reader’s mode before the browser can paint, with no other reader of the mode', async () => {
    stubStorage('night')
    let afterCommit: string | null | undefined
    /** Reads the element in a microtask queued by the hydration commit: after that commit's synchronous work. */
    function FirstFrame() {
      useLayoutEffect(() => {
        queueMicrotask(() => {
          afterCommit ??= colorOf('styled')
        })
      }, [])
      return null
    }
    const tree = () =>
      ThemeProvider({
        tokens: TOKENS,
        modes: MODES,
        defaultMode: 'morning',
        children: [Div({ key: 'styled', id: 'styled', css: byMode, children: 'x' }), createElement(FirstFrame, { key: 'frame' })],
      } as never).render() as ReactNode
    const container = document.createElement('div')
    container.innerHTML = renderToString(tree())
    document.body.appendChild(container)

    // React's own scheduler rather than `act`, which would run the commit's
    // passive effects before the microtask.
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
    const root = hydrateRoot(container, tree(), { onRecoverableError: () => {} })
    try {
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(afterCommit).toBe(NIGHT)
    } finally {
      root.unmount()
      ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    }
  })

  it.each([
    ['a flat style prop', () => Div({ id: 'styled', color: byMode.color, children: 'x' } as never).render()],
    [
      'an item of an array css',
      () => Div({ id: 'styled', css: [{ padding: 1 }, (theme: { mode: string }) => ({ color: byMode.color(theme) })] as never, children: 'x' }).render(),
    ],
  ])('follows the reader’s mode as %s', async (_, element) => {
    stubStorage('night')
    const { root } = await hydrate(element)

    expect(colorOf('styled')).toBe(NIGHT)
    await act(async () => setMode('morning'))
    expect(colorOf('styled')).toBe(MORNING)
    act(() => root.unmount())
  })

  it('styles its element for the reader’s mode from the first render of a client-only mount', async () => {
    stubStorage('night')
    const colors: (string | null)[] = []
    /** Reads the element after each commit that renders it, once its styles are in. */
    function Probe({ color }: { color: (theme: { mode: string }) => string }) {
      useLayoutEffect(() => void colors.push(colorOf('styled')))
      return Div({ id: 'styled', css: { color }, children: 'x' }).render()
    }
    const container = document.body.appendChild(document.createElement('div'))
    const root = createRoot(container)
    await act(async () => root.render(page(() => createElement(Probe, { color: byMode.color }))))

    expect(colors).toEqual([NIGHT])
    act(() => root.unmount())
  })

  it('re-renders its own element only, and leaves a boundary it wraps dehydrated until that hydrates', async () => {
    stubStorage('night')
    function Content() {
      return createElement('p', { id: 'content' }, 'server content')
    }
    let loadChunk!: () => void
    const chunk = new Promise<{ default: typeof Content }>(resolve => (loadChunk = () => resolve({ default: Content })))
    const LazyContent = lazy(() => chunk)
    let client = false
    const tree = () =>
      Div({
        id: 'styled',
        css: byMode,
        children: createElement(Suspense, { fallback: createElement('p', { id: 'fallback' }, 'loading') }, createElement(client ? LazyContent : Content)),
      }).render()

    const container = document.createElement('div')
    container.innerHTML = renderToString(page(tree))
    document.body.appendChild(container)
    const server = container.querySelector('#content')
    client = true
    let root!: ReturnType<typeof hydrateRoot>
    await act(async () => {
      root = hydrateRoot(container, page(tree), { onRecoverableError: () => {} })
    })

    expect(colorOf('styled')).toBe(NIGHT)
    expect(container.querySelector('#content')).toBe(server)
    await act(async () => {
      loadChunk()
      await chunk
    })
    expect(container.querySelector('#content')).toBe(server)
    act(() => root.unmount())
  })
})

describe('an element whose css gains or loses a theme function between renders', () => {
  it('is styled for the reader’s mode while it has one, keeps everything below it, and is styled by its values once it has none', async () => {
    stubStorage('night')
    let withFunction = false
    let mounts = 0
    function Child() {
      useEffect(() => void mounts++, [])
      return createElement('input', { id: 'field', defaultValue: '' })
    }
    const container = document.body.appendChild(document.createElement('div'))
    const root = createRoot(container)
    const render = () =>
      root.render(page(() => Div({ id: 'styled', css: withFunction ? byMode : { color: 'rgb(0, 0, 3)' }, children: createElement(Child) }).render()))
    await act(async () => render())
    expect(colorOf('styled')).toBe('rgb(0, 0, 3)')
    const field = document.getElementById('field') as HTMLInputElement
    field.value = 'typed'

    withFunction = true
    await act(async () => render())
    expect(colorOf('styled')).toBe(NIGHT)

    withFunction = false
    await act(async () => render())
    expect(colorOf('styled')).toBe('rgb(0, 0, 3)')
    expect(mounts).toBe(1)
    expect(document.getElementById('field')).toBe(field)
    expect(field.value).toBe('typed')
    act(() => root.unmount())
  })
})

describe('an element whose css holds no theme function', () => {
  it('does not re-render when the reader’s mode is adopted, or when it is set', async () => {
    stubStorage('night')
    const renders: string[] = []
    const { root } = await hydrate(() =>
      createElement(
        Profiler,
        { id: 'plain', onRender: (_: string, phase: string) => void renders.push(phase) },
        Div({ id: 'plain', css: { color: 'theme.colors.primary', padding: 4 }, children: 'x' }).render(),
      ),
    )
    await act(async () => setMode('morning'))

    expect(renders).toEqual(['mount'])
    act(() => root.unmount())
  })
})
