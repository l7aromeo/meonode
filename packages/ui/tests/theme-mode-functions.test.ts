// @vitest-environment jsdom
//
// A css theme function is handed the theme, and may read `theme.mode`. The
// element it styles follows the reader's mode: after hydration, and after
// `setMode`. Only such an element re-renders when the mode changes; one whose
// css holds no function never does, so nothing it wraps is disturbed.
import { act, createElement, lazy, Profiler, type ReactNode, Suspense, useLayoutEffect } from 'react'
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

/** The page, below a component boundary so nothing is resolved as the provider's own props. */
const page = (children: () => ReactNode) =>
  ThemeProvider({
    tokens: TOKENS,
    modes: MODES,
    defaultMode: 'morning',
    children: [
      createElement(Setter, { key: 'setter' }),
      Node(
        function Page() {
          return children() as never
        },
        { key: 'page' },
      ),
    ],
  } as never).render() as ReactNode

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
  it('is styled for the reader’s mode while it has one, and by its values once it has none', async () => {
    stubStorage('night')
    let withFunction = false
    const container = document.body.appendChild(document.createElement('div'))
    const root = createRoot(container)
    const render = () => root.render(page(() => Div({ id: 'styled', css: withFunction ? byMode : { color: 'rgb(0, 0, 3)' }, children: 'x' }).render()))
    await act(async () => render())
    expect(colorOf('styled')).toBe('rgb(0, 0, 3)')

    withFunction = true
    await act(async () => render())
    expect(colorOf('styled')).toBe(NIGHT)

    withFunction = false
    await act(async () => render())
    expect(colorOf('styled')).toBe('rgb(0, 0, 3)')
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
