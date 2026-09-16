// The mode-aware provider path, which exists so a themed SSR document does not
// vary per reader.
//
// The document stops depending on the mode: token values are `var()` references,
// the palettes live in CSS keyed by `[data-theme="…"]`, and a blocking script
// sets that attribute before the first paint. The server then renders one
// document for everyone, and there is no flicker because there was never a wrong
// first paint to correct.
//
// The property that design rests on — the SSR bytes are identical whatever the
// reader stored — cannot be asserted here. jsdom sees a client render, not a
// document. What is checkable here is its unit-level half: the emitted `:root`
// block is a pure function of `tokens` and does not move with the mode. The
// whole-document claim belongs to the RSC suite.
import React from 'react'
import { createNode, ThemeModesProvider, ThemeProvider, useTheme, type Theme } from '@src/main.js'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TOKENS = {
  colors: { primary: 'var(--brand-primary)', bg: 'var(--brand-bg)' },
  spacing: { md: '16px' },
}

const root = () => document.documentElement

/**
 * jsdom here has no Web Storage, and the library guards for exactly that, so the
 *  tests supply one rather than assuming the environment does.
 */
function stubStorage() {
  const map = new Map<string, string>()
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  }
  vi.stubGlobal('localStorage', storage)
  return storage
}
let storage: ReturnType<typeof stubStorage>
const styleTag = () => document.querySelector('style[data-meonode-theme-vars]')

/** Every `matchMedia` listener registered while this stands, so a change can be delivered. */
function stubMatchMedia(matchesDark: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>()
  let matches = matchesDark
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return matches
    },
    addEventListener: (_: string, fn: (event: { matches: boolean }) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (event: { matches: boolean }) => void) => listeners.delete(fn),
  }))
  return {
    emit(next: boolean) {
      matches = next
      act(() => listeners.forEach(fn => fn({ matches: next })))
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

/** Reports what the hook hands back, and offers the two setters as buttons. */
const Probe = createNode(function Probe() {
  const { mode, preference, setMode, setPreference } = useTheme() as never as {
    mode: string
    preference: string
    setMode: (mode: string) => void
    setPreference: (preference: string) => void
  }
  return React.createElement(
    'div',
    { 'data-testid': 'probe', 'data-mode': mode, 'data-preference': preference },
    React.createElement('button', { type: 'button', 'data-testid': 'to-night', onClick: () => setMode('night') }, 'night'),
    React.createElement('button', { type: 'button', 'data-testid': 'to-system', onClick: () => setPreference('system') }, 'system'),
    React.createElement('button', { type: 'button', 'data-testid': 'to-sepia', onClick: () => setMode('sepia') }, 'sepia'),
  )
})

const modeProvider = (overrides: Record<string, unknown> = {}) =>
  ThemeModesProvider({
    tokens: TOKENS,
    modes: ['morning', 'night'],
    defaultMode: 'morning',
    children: Probe({}),
    ...overrides,
  } as never)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.querySelectorAll('style[data-meonode-theme-vars]').forEach(node => node.remove())
  root().removeAttribute('data-theme')
  root().className = ''
})

beforeEach(() => {
  storage = stubStorage()
  root().removeAttribute('data-theme')
})

describe('mode-aware provider', () => {
  it('seeds the mode from an existing data-theme attribute, which the pre-paint script wrote', () => {
    root().setAttribute('data-theme', 'night')
    const { getByTestId } = render(modeProvider().render() as never)
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('night')
  })

  it('falls back to defaultMode when nothing has been written yet', () => {
    const { getByTestId } = render(modeProvider().render() as never)
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('morning')
  })

  it('carries a mode name that is neither light nor dark all the way to the attribute', () => {
    const { getByTestId } = render(modeProvider({ modes: ['morning', 'sepia'], defaultMode: 'morning' }).render() as never)
    fireEvent.click(getByTestId('to-sepia'))
    expect(root().getAttribute('data-theme')).toBe('sepia')
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('sepia')
    // One attribute is the whole contract on this path; `[data-theme='night']` is
    // the selector, so there are no classes to keep in step with it.
    expect(root().className).toBe('')
  })

  it('stores the preference rather than the resolved mode, so following the system stays possible', () => {
    const media = stubMatchMedia(false)
    const { getByTestId } = render(modeProvider({ system: { light: 'morning', dark: 'night' } }).render() as never)

    fireEvent.click(getByTestId('to-system'))
    expect(storage.getItem('theme')).toBe('system')
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('morning')

    media.emit(true)
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('night')
    expect(root().getAttribute('data-theme')).toBe('night')
  })

  it('offers system only when the mapping says what the OS words mean here', () => {
    const media = stubMatchMedia(true)
    const { getByTestId } = render(modeProvider().render() as never)

    fireEvent.click(getByTestId('to-system'))
    // No mapping, so `prefers-color-scheme: dark` cannot be translated into one
    // of this app's mode names and the request is refused rather than guessed.
    expect(getByTestId('probe').getAttribute('data-preference')).not.toBe('system')
    expect(media.listenerCount).toBe(0)
  })

  it('persists an explicit choice under the storage key', () => {
    const { getByTestId } = render(modeProvider({ storageKey: 'ui-mode' }).render() as never)
    fireEvent.click(getByTestId('to-night'))
    expect(storage.getItem('ui-mode')).toBe('night')
    expect(storage.getItem('theme')).toBeNull()
  })

  it('emits the same :root block whatever the mode, which is what makes the document cacheable', () => {
    root().setAttribute('data-theme', 'morning')
    render(modeProvider().render() as never)
    const morning = styleTag()?.textContent
    cleanup()
    document.querySelectorAll('style[data-meonode-theme-vars]').forEach(node => node.remove())

    root().setAttribute('data-theme', 'night')
    render(modeProvider().render() as never)
    expect(styleTag()?.textContent).toBe(morning)
    expect(morning).toContain('--meonode-theme-colors-primary:var(--brand-primary);')
  })

  it('does not write the DOM from the hook: a consumer re-rendering on its own touches nothing', () => {
    // The provider asserts the attribute whenever *it* renders, which is what
    // repairs a document that lost it. What must not happen is a write per
    // consumer: every component calling `useTheme` used to run an effect that
    // stamped the document, so a provider sitting on its default overwrote a
    // choice another consumer had just made.
    const Counter = createNode(function Counter() {
      const [n, setN] = React.useState(0)
      useTheme()
      return React.createElement('button', { type: 'button', 'data-testid': 'bump', onClick: () => setN(n + 1) }, String(n))
    })
    const { getByTestId } = render(
      ThemeModesProvider({ tokens: TOKENS, modes: ['morning', 'night'], defaultMode: 'morning', children: Counter({}) } as never).render() as never,
    )
    expect(root().getAttribute('data-theme')).toBe('morning')

    root().setAttribute('data-theme', 'elsewhere')
    fireEvent.click(getByTestId('bump'))
    fireEvent.click(getByTestId('bump'))
    // The consumer re-rendered twice and the provider did not, so nothing was
    // written. A hook that wrote would have put `morning` back.
    expect(root().getAttribute('data-theme')).toBe('elsewhere')
  })
})

describe('the legacy theme path', () => {
  const LEGACY: Theme = { mode: 'dark', system: { colors: { primary: 'rgb(1, 2, 3)' } } }
  const Reader = createNode(function Reader() {
    const { theme } = useTheme()
    return React.createElement('div', { 'data-testid': 'reader', 'data-mode': String(theme.mode) }, 'x')
  })

  it('still stamps the attribute and the classes from the hook', () => {
    render(ThemeProvider({ theme: LEGACY, children: Reader({}) }).render() as never)
    expect(root().getAttribute('data-theme')).toBe('dark')
    expect(root().classList.contains('dark-theme')).toBe(true)
    expect(root().classList.contains('light-theme')).toBe(false)
    expect(storage.getItem('theme')).toBe('dark')
  })

  it('still rewrites the attribute from the hook, which the new path deliberately does not', () => {
    const Switcher = createNode(function Switcher() {
      const { theme, setTheme } = useTheme()
      return React.createElement('button', { type: 'button', 'data-testid': 'to-light', onClick: () => setTheme({ ...theme, mode: 'light' }) }, 'light')
    })
    const { getByTestId } = render(ThemeProvider({ theme: LEGACY, children: Switcher({}) }).render() as never)

    // The inverse of the mode path's guarantee. Here the consumer's own effect
    // owns the attribute, so a theme change stamps over whatever else put a
    // value there — the behaviour existing applications are built on. The new
    // path refuses to do this, which is why the same assertion cannot pass on
    // both.
    root().setAttribute('data-theme', 'elsewhere')
    fireEvent.click(getByTestId('to-light'))
    expect(root().getAttribute('data-theme')).toBe('light')
    expect(root().classList.contains('light-theme')).toBe(true)
    expect(root().classList.contains('dark-theme')).toBe(false)
  })

  it('refuses the mode-path setters instead of half-applying a theme', () => {
    // `setMode` on this path could only keep the current `system` while changing
    // `mode`, and here the two palettes are different objects with different
    // values — so it produced a theme claiming dark while emitting light's
    // variables, and the hook then stamped `data-theme="dark"` over it. A
    // consumer reaching for the obvious method got a half-applied theme and no
    // error. Swapping a whole theme is what `setTheme` is for.
    const api: Record<string, unknown> = {}
    const Grab = createNode(function Grab() {
      Object.assign(api, useTheme())
      return React.createElement('div')
    })
    render(ThemeProvider({ theme: LEGACY, children: Grab({}) }).render() as never)

    expect(() => (api.setMode as (mode: string) => void)('light')).toThrow(/ThemeModesProvider/)
    expect(() => (api.setPreference as (preference: string) => void)('system')).toThrow(/ThemeModesProvider/)
    // No preference concept exists here, so reporting one would be a fabrication.
    expect(api.preference).toBeUndefined()
    // The mode is genuinely the theme's own, and stays.
    expect(api.mode).toBe('dark')
  })

  it('still resolves tokens into the :root block', () => {
    render(ThemeProvider({ theme: LEGACY, children: Reader({}) }).render() as never)
    expect(styleTag()?.textContent).toContain('--meonode-theme-colors-primary:rgb(1, 2, 3);')
  })
})

describe('state the provider did not choose', () => {
  it('ignores a data-theme naming a mode that no longer exists, rather than adopting it', () => {
    // A rename, or devtools. Adopting it would leave every `[data-theme=…]`
    // selector unmatched, which looks like the theme system is broken outright.
    root().setAttribute('data-theme', 'dusk')
    const { getByTestId } = render(modeProvider().render() as never)
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('morning')
  })

  it('renders at the default when the pre-paint script is missing entirely', () => {
    expect(root().hasAttribute('data-theme')).toBe(false)
    const { getByTestId } = render(modeProvider().render() as never)
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('morning')
    // Degrades to "works, without persistence" — the likeliest misconfiguration
    // in the wild, and not a crash.
  })
})

describe('rejections', () => {
  it('refuses a mode that was never declared', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getByTestId } = render(modeProvider({ modes: ['morning', 'night'] }).render() as never)
    fireEvent.click(getByTestId('to-sepia'))
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('morning')
    expect(root().getAttribute('data-theme')).not.toBe('sepia')
    expect(storage.getItem('theme')).toBeNull()
    expect(warn.mock.calls.some(call => String(call[0]).includes('sepia'))).toBe(true)
    warn.mockRestore()
  })

  it('says why system was refused rather than failing quietly', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubMatchMedia(true)
    const { getByTestId } = render(modeProvider().render() as never)
    fireEvent.click(getByTestId('to-system'))
    expect(warn.mock.calls.some(call => String(call[0]).includes('system'))).toBe(true)
    warn.mockRestore()
  })
})

describe('the OS subscription', () => {
  it('does not follow the OS once a mode has been chosen outright', () => {
    const media = stubMatchMedia(false)
    const { getByTestId } = render(modeProvider({ system: { light: 'morning', dark: 'night' } }).render() as never)

    fireEvent.click(getByTestId('to-night'))
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('night')

    media.emit(true)
    media.emit(false)
    // An explicit choice outranks the OS. If this passed with an always-on
    // subscription the mode would have followed the second emit back to morning.
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('night')
    expect(root().getAttribute('data-theme')).toBe('night')
  })
})

describe('storage that is not there', () => {
  it('still toggles when every storage call throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    const { getByTestId } = render(modeProvider().render() as never)
    fireEvent.click(getByTestId('to-night'))
    // Persistence is lost, which is survivable. The toggle is not.
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('night')
    expect(root().getAttribute('data-theme')).toBe('night')
  })

  it('ignores a legacy stored value that is not one of the modes', () => {
    // The original path writes `localStorage.theme` as a *mode*. This path stores
    // a *preference* under the same default key, so an upgrading app reads one
    // where it expects the other. A value that is still a declared mode is
    // honoured as an explicit choice; anything else is discarded for the default.
    storage.setItem('theme', 'dark')
    const { getByTestId } = render(modeProvider().render() as never)
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('morning')
  })

  it('honours a legacy stored value that is still a declared mode', () => {
    storage.setItem('theme', 'night')
    const { getByTestId } = render(modeProvider().render() as never)
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('night')
  })
})

describe('nesting and misuse', () => {
  it('lets an inner provider hold its own mode', () => {
    root().setAttribute('data-theme', 'night')
    const Inner = createNode(function Inner() {
      const { mode } = useTheme() as never as { mode: string }
      return React.createElement('div', { 'data-testid': 'inner', 'data-mode': mode })
    })
    const { getByTestId } = render(
      ThemeModesProvider({
        tokens: TOKENS,
        modes: ['morning', 'night'],
        defaultMode: 'morning',
        children: ThemeModesProvider({ tokens: TOKENS, modes: ['morning', 'night'], defaultMode: 'morning', children: Inner({}) } as never),
      } as never).render() as never,
    )
    expect(getByTestId('inner').getAttribute('data-mode')).toBe('night')
    expect(document.querySelectorAll('style[data-meonode-theme-vars]')).toHaveLength(2)
  })

  it('still throws when used outside any provider', () => {
    const Orphan = createNode(function Orphan() {
      useTheme()
      return React.createElement('div')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(Orphan({}).render() as never)).toThrow(/useTheme must be used within a ThemeProvider/)
    error.mockRestore()
  })
})
