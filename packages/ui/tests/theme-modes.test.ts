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
import { createNode, ThemeProvider, useTheme } from '@src/main.js'
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
  ThemeProvider({
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
      ThemeProvider({ tokens: TOKENS, modes: ['morning', 'night'], defaultMode: 'morning', children: Counter({}) } as never).render() as never,
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
      ThemeProvider({
        tokens: TOKENS,
        modes: ['morning', 'night'],
        defaultMode: 'morning',
        children: ThemeProvider({ tokens: TOKENS, modes: ['morning', 'night'], defaultMode: 'morning', children: Inner({}) } as never),
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

describe('defaultPreference', () => {
  // What the application chooses for a reader who has never chosen. The mode
  // cannot express it: `defaultMode: 'night'` says "dark when nothing is stored",
  // while `defaultPreference: 'system'` says "follow the OS until told
  // otherwise", and those are different products.
  it('starts a fresh reader on the declared preference', () => {
    const { getByTestId } = render(modeProvider({ defaultPreference: 'night' }).render() as never)
    expect(getByTestId('probe').getAttribute('data-preference')).toBe('night')
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('night')
  })

  it('resolves a default of system against the OS', () => {
    stubMatchMedia(true)
    const { getByTestId } = render(modeProvider({ defaultPreference: 'system', system: { light: 'morning', dark: 'night' } }).render() as never)
    expect(getByTestId('probe').getAttribute('data-preference')).toBe('system')
    expect(getByTestId('probe').getAttribute('data-mode')).toBe('night')
  })

  it('throws when the application asks for system without saying what the OS words mean', () => {
    // Authored, unlike a *stored* `system` with no mapping, which is a reader's
    // leftover and degrades quietly. This one is in the source and can be fixed.
    expect(() => render(modeProvider({ defaultPreference: 'system' }).render() as never)).toThrow(/system/)
  })

  it('yields to what the reader actually chose', () => {
    storage.setItem('theme', 'morning')
    const { getByTestId } = render(modeProvider({ defaultPreference: 'night' }).render() as never)
    expect(getByTestId('probe').getAttribute('data-preference')).toBe('morning')
  })
})

describe('telling a working script from a recovered one', () => {
  // The repair makes a dead pre-paint script indistinguishable from a live one
  // once hydration has settled: same mode, same palette, no errors. So the only
  // thing that can catch a regression killing the script is *when* the attribute
  // first appears — before React, or not until the provider adopts.
  const observe = () => {
    const seen: (string | null)[] = []
    const Watcher = createNode(function Watcher() {
      useTheme()
      // A child's layout effect runs before its parent's, so this fires before
      // the provider has adopted — which is exactly the window in question.
      React.useLayoutEffect(() => void seen.push(root().getAttribute('data-theme')), [])
      return React.createElement('div')
    })
    return { seen, Watcher }
  }

  it('sees the attribute already present when the script ran', () => {
    storage.setItem('theme', 'night')
    root().setAttribute('data-theme', 'night')
    const { seen, Watcher } = observe()
    render(ThemeProvider({ tokens: TOKENS, modes: ['morning', 'night'], defaultMode: 'morning', children: Watcher({}) } as never).render() as never)
    expect(seen).toEqual(['night'])
    expect(root().getAttribute('data-theme')).toBe('night')
  })

  it('sees nothing there when the script did not run, and the end state still matches', () => {
    storage.setItem('theme', 'night')
    // No attribute: the script was blocked — by CSP, by a proxy, by being
    // dropped from the document entirely.
    const { seen, Watcher } = observe()
    render(ThemeProvider({ tokens: TOKENS, modes: ['morning', 'night'], defaultMode: 'morning', children: Watcher({}) } as never).render() as never)
    expect(seen).toEqual([null])
    // Recovered afterwards, which is why nothing downstream of hydration can
    // tell the two apart.
    expect(root().getAttribute('data-theme')).toBe('night')
  })
})
