// @vitest-environment jsdom
//
// The first client render has to match the server's, and the mode is the one
// value the server cannot know — that is the whole premise of this path.
//
// Reading `document` or `localStorage` inside a `useState` initialiser runs
// during the first render, so the server renders `defaultMode` and the client
// renders whatever the reader stored. React requires those two to be identical.
// Any consumer rendering markup from `mode` — a toggle's `checked`, a different
// icon, an offset — then throws #418, and React discards the server tree and
// client-renders the document, which also resets the attributes the pre-paint
// script wrote. The attribute loss is the symptom; this is the cause.
import { createElement, type ReactNode } from 'react'
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNode, ThemeProvider, useTheme } from '@src/main.js'

// React only reports hydration mismatches synchronously when it knows it is in
// an act environment. Without this, `act()` warns that it is unsupported, the
// work lands after the console spy is restored, and every assertion about
// captured errors passes because nothing was ever captured.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TOKENS = { colors: { primary: 'var(--brand-primary)' } }
const MODES = ['morning', 'night'] as const
const root = () => document.documentElement

/** Renders markup that differs per *preference*, which is the three-way-control case. */
const PreferenceDependent = createNode(function PreferenceDependent() {
  const { preference } = useTheme() as never as { preference?: string }
  return createElement('span', { 'data-testid': 'pref', 'data-pref': String(preference) }, String(preference))
})

/** Reports the handover flag, which is the escape hatch for consumers that must render from `mode`. */
const HydrationFlag = createNode(function HydrationFlag() {
  const { hydrated, mode } = useTheme() as never as { hydrated: boolean; mode: string }
  return createElement('span', { 'data-testid': 'flag', 'data-hydrated': String(hydrated), 'data-mode': mode })
})

/** Renders markup that differs per mode, which is what turns a mismatch into an error. */
const ModeDependent = createNode(function ModeDependent() {
  const { mode } = useTheme() as never as { mode: string }
  return createElement('input', { type: 'checkbox', readOnly: true, checked: mode === 'night', 'data-testid': 'toggle', 'data-mode': mode })
})

const tree = () =>
  ThemeProvider({
    tokens: TOKENS,
    modes: MODES,
    defaultMode: 'morning',
    children: ModeDependent({}),
  } as never).render() as ReactNode

const HYDRATION_MARKERS = [/did not match/i, /hydration failed/i, /server rendered/i, /text content does not match/i, /server html/i, /#418/]

function captureErrors() {
  const messages: string[] = []
  const push = (...args: unknown[]) => void messages.push(args.map(String).join(' '))
  const error = vi.spyOn(console, 'error').mockImplementation(push)
  const warn = vi.spyOn(console, 'warn').mockImplementation(push)
  return {
    messages,
    restore: () => {
      error.mockRestore()
      warn.mockRestore()
    },
  }
}

/** The server has neither, so nothing may read them during the first render. */
function withoutBrowserState<T>(body: () => T): T {
  const realDocument = globalThis.document
  const realStorage = globalThis.localStorage
  Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true })
  try {
    return body()
  } finally {
    Object.defineProperty(globalThis, 'document', { value: realDocument, configurable: true })
    Object.defineProperty(globalThis, 'localStorage', { value: realStorage, configurable: true })
  }
}

function hydrateWithStoredMode(stored: string, stamped: string, subject: () => ReactNode = tree, media?: () => unknown) {
  const html = withoutBrowserState(() => renderToString(subject()))

  const map = new Map<string, string>([['theme', stored]])
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  })
  if (media) vi.stubGlobal('matchMedia', media)
  root().setAttribute('data-theme', stamped)

  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)

  const { messages, restore } = captureErrors()
  let hydrated: ReturnType<typeof hydrateRoot>
  act(() => {
    // React 19 hands recoverable hydration errors to this callback and recovers
    // by client-rendering; the console is a secondary channel and, for a text
    // mismatch, can stay silent. Collecting both is what makes the assertion
    // real — verified by planting a mismatch and watching it appear here.
    hydrated = hydrateRoot(container, subject(), {
      onRecoverableError: (error: unknown) => void messages.push(String((error as { message?: string })?.message ?? error)),
    })
  })
  restore()
  return {
    html,
    container,
    offending: messages.filter(m => HYDRATION_MARKERS.some(p => p.test(m))),
    cleanup: () => {
      act(() => hydrated.unmount())
      container.remove()
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  root().removeAttribute('data-theme')
  root().removeAttribute('data-theme-preference')
  document.querySelectorAll('style[data-meonode-theme-vars]').forEach(node => node.remove())
})

const preferenceTree = () =>
  ThemeProvider({
    tokens: TOKENS,
    modes: MODES,
    defaultMode: 'morning',
    system: { light: 'morning', dark: 'night' },
    children: PreferenceDependent({}),
  } as never).render() as ReactNode

const flagTree = () => ThemeProvider({ tokens: TOKENS, modes: MODES, defaultMode: 'morning', children: HydrationFlag({}) } as never).render() as ReactNode

describe('hydrating with a non-default mode', () => {
  it('reports hydrated false until the handover, so a consumer can gate on it', () => {
    const { html, container, offending, cleanup } = hydrateWithStoredMode('night', 'night', flagTree)
    // What the server sent, and therefore what the first client render must
    // also produce: not yet adopted.
    expect(html).toContain('data-hydrated="false"')
    expect(html).toContain('data-mode="morning"')
    expect(offending).toEqual([])
    // After the handover, both have moved.
    expect(container.querySelector('[data-testid="flag"]')?.getAttribute('data-hydrated')).toBe('true')
    expect(container.querySelector('[data-testid="flag"]')?.getAttribute('data-mode')).toBe('night')
    cleanup()
  })

  it('does not mismatch when the reader stored the mode that is not the default', () => {
    const { html, offending, container, cleanup } = hydrateWithStoredMode('night', 'night')
    // Non-vacuity: an empty render cannot mismatch.
    expect(html).toContain('type="checkbox"')
    expect(offending).toEqual([])
    // And it adopts, rather than staying on the default it hydrated with.
    expect(container.querySelector('[data-testid="toggle"]')?.getAttribute('data-mode')).toBe('night')
    cleanup()
  })

  it('renders the same markup on the client as the server sent, before adopting', () => {
    const serverHtml = withoutBrowserState(() => renderToString(tree()))
    const map = new Map<string, string>([['theme', 'night']])
    vi.stubGlobal('localStorage', { getItem: (k: string) => map.get(k) ?? null, setItem: () => {} })
    root().setAttribute('data-theme', 'night')
    // The same component tree rendered on the client, with the reader's stored
    // mode fully visible, must still produce the server's bytes on its first
    // pass — that is what React compares.
    expect(renderToString(tree())).toBe(serverHtml)
  })

  it('does not mismatch on the preference either, which a control showing "system" renders from', () => {
    // `preference` is the other value a consumer renders directly — a three-way
    // control shows the chosen position, not the resolved mode — so it carries
    // the same constraint and needs its own case. Reading storage during the
    // first render breaks this one while leaving the mode case passing.
    const { offending, container, cleanup } = hydrateWithStoredMode('system', 'night', preferenceTree, () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    expect(offending).toEqual([])
    expect(container.querySelector('[data-testid="pref"]')?.getAttribute('data-pref')).toBe('system')
    cleanup()
  })

  it('adopts what the reader is looking at when the OS answer disagrees with it', () => {
    // Stored `system`, the script resolved it to `night`, and by the time React
    // mounts `matchMedia` says light. The attribute is what is on screen, so
    // taking it costs nothing; taking the media query would repaint the page at
    // handover for a difference of milliseconds. A genuine later change comes
    // through the subscription instead.
    const { offending, container, cleanup } = hydrateWithStoredMode('system', 'night', preferenceTree, () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    expect(offending).toEqual([])
    expect(root().getAttribute('data-theme')).toBe('night')
    expect(container.querySelector('[data-testid="pref"]')?.getAttribute('data-pref')).toBe('system')
    cleanup()
  })

  it('still refuses a stored mode that was never declared', () => {
    // The control row: the script rejects it too, so the document says
    // `morning` and so must the tree.
    const { offending, container, cleanup } = hydrateWithStoredMode('dusk', 'morning')
    expect(offending).toEqual([])
    expect(container.querySelector('[data-testid="toggle"]')?.getAttribute('data-mode')).toBe('morning')
    cleanup()
  })
})
