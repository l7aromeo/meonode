// The pre-paint script: the half of the mode-aware theme that has to run before
// React exists at all.
//
// The document the server sends is the same for every reader, so nothing in it
// says which mode to paint. This script answers that in the only window where
// the answer is still invisible — after the document element exists, before the
// first paint — by stamping `data-theme` on `<html>`. The provider then seeds
// itself from that attribute instead of from storage, so React never disagrees
// with what is already on screen.
//
// What is asserted here is the emitted source and its behaviour. The claim it
// exists to support — that the server's bytes do not move with the stored
// preference — is a whole-document property and lives in the RSC suite.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { themeScript } from '@src/main.js'

/** The inline source the returned node carries. */
const sourceOf = (node: { rawProps: Record<string, unknown> }): string => (node.rawProps.dangerouslySetInnerHTML as { __html: string }).__html

const run = (source: string): void => {
  new Function(source)()
}

const root = () => document.documentElement

/**
 * Web Storage, supplied rather than assumed.
 *
 * jsdom's `localStorage` does not reach `globalThis` here — Node's own
 * experimental global shadows it and reports itself unavailable — and the
 * emitted source reads the bare global, exactly as a browser would. Giving the
 * global a store of our own is what makes that read observable at all.
 */
const stubStorage = (entries: Record<string, string> = {}, onRead?: () => never) => {
  const store = new Map(Object.entries(entries))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => {
      onRead?.()
      return store.get(key) ?? null
    },
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  })
}

const MODES = {
  modes: ['morning', 'night'],
  defaultMode: 'morning',
} as const

const WITH_SYSTEM = {
  ...MODES,
  system: { light: 'morning', dark: 'night' },
} as const

/** jsdom ships no `matchMedia`; every caller here decides what the OS says. */
const stubMatchMedia = (prefersDark: boolean) => {
  const listeners: ((event: { matches: boolean }) => void)[] = []
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    matches: prefersDark,
    addEventListener: (_: string, fn: (event: { matches: boolean }) => void) => listeners.push(fn),
    removeEventListener: () => {},
  }))
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  stubStorage()
  root().removeAttribute('data-theme')
  root().removeAttribute('data-theme-preference')
})

describe('the node it returns', () => {
  it('is a plain inline script, not a resource React may hoist or defer', () => {
    const node = themeScript(MODES)
    const element = node.render() as { type: string; props: Record<string, unknown> }

    expect(element.type).toBe('script')
    // A `src` would make this a resource: React 19 hoists and may defer one,
    // which moves it out of the pre-paint window the whole design depends on.
    expect(element.props.src).toBeUndefined()
    expect(element.props.async).toBeUndefined()
    expect(element.props.defer).toBeUndefined()
    expect(typeof sourceOf(node)).toBe('string')
  })
})

describe('determinism', () => {
  // Load-bearing, and not for tidiness: under a hash-only CSP the served
  // `script-src 'sha256-…'` is computed once, ahead of the request. A single
  // byte of drift between that computation and the rendered document — a
  // re-ordered key, an interpolated value — and the browser refuses to run the
  // script. The page then paints in the wrong mode with no way to recover.
  it('gives byte-identical source for the same config', () => {
    expect(sourceOf(themeScript(WITH_SYSTEM))).toBe(sourceOf(themeScript(WITH_SYSTEM)))
  })

  it('does not vary with the identity or key order of the config object', () => {
    const a = themeScript({ modes: ['morning', 'night'], defaultMode: 'morning', system: { light: 'morning', dark: 'night' }, storageKey: 'theme' })
    const b = themeScript({ storageKey: 'theme', system: { dark: 'night', light: 'morning' }, defaultMode: 'morning', modes: ['morning', 'night'] })

    expect(sourceOf(b)).toBe(sourceOf(a))
  })

  it('does vary when the config does, or the hash would cover the wrong script', () => {
    expect(sourceOf(themeScript({ ...MODES, storageKey: 'ui-theme' }))).not.toBe(sourceOf(themeScript(MODES)))
  })
})

describe('the try/catch is not decoration', () => {
  it('bails rather than throwing when storage is blocked', () => {
    stubStorage({}, () => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    })

    expect(() => run(sourceOf(themeScript(MODES)))).not.toThrow()
  })

  it('bails rather than throwing when matchMedia is missing', () => {
    stubStorage({ theme: 'system' })

    expect(() => run(sourceOf(themeScript(WITH_SYSTEM)))).not.toThrow()
  })
})

describe('resolving the stored preference', () => {
  it('stamps the stored mode on the document element', () => {
    stubStorage({ theme: 'night' })
    run(sourceOf(themeScript(MODES)))

    expect(root().getAttribute('data-theme')).toBe('night')
    expect(root().getAttribute('data-theme-preference')).toBe('night')
  })

  it('stamps the default when nothing is stored', () => {
    run(sourceOf(themeScript(MODES)))

    expect(root().getAttribute('data-theme')).toBe('morning')
    expect(root().getAttribute('data-theme-preference')).toBe('morning')
  })

  it('falls back to the default for a value that is no longer a declared mode', () => {
    // A mode the application has since renamed, or a hand-edited value. Left
    // alone it reaches `data-theme`, the provider refuses it, and the attribute
    // is rewritten after hydration — the flash this script exists to remove,
    // for the reader most likely to have an old value.
    stubStorage({ theme: 'twilight' })
    run(sourceOf(themeScript(MODES)))

    expect(root().getAttribute('data-theme')).toBe('morning')
    expect(root().getAttribute('data-theme-preference')).toBe('morning')
  })

  it('reads the storage key it was given', () => {
    stubStorage({ 'ui-theme': 'night' })
    run(sourceOf(themeScript({ ...MODES, storageKey: 'ui-theme' })))

    expect(root().getAttribute('data-theme')).toBe('night')
  })
})

describe('following the system', () => {
  it('is not in the emitted source at all without a mapping', () => {
    // The media query answers in the OS's two words. An application whose modes
    // are `morning` and `night` has not said which is which until it says so,
    // and guessing is how a `sepia` gets painted as light.
    const source = sourceOf(themeScript(MODES))

    expect(source).not.toContain('matchMedia')
    expect(source).not.toContain('prefers-color-scheme')
  })

  it('resolves to the dark name when the OS says dark', () => {
    stubStorage({ theme: 'system' })
    stubMatchMedia(true)
    run(sourceOf(themeScript(WITH_SYSTEM)))

    expect(root().getAttribute('data-theme')).toBe('night')
    // The preference stays `system`, not the mode it resolved to. Storing the
    // resolved mode would pin it: the next OS change would go unnoticed.
    expect(root().getAttribute('data-theme-preference')).toBe('system')
  })

  it('resolves to the light name when the OS says light', () => {
    stubStorage({ theme: 'system' })
    stubMatchMedia(false)
    run(sourceOf(themeScript(WITH_SYSTEM)))

    expect(root().getAttribute('data-theme')).toBe('morning')
    expect(root().getAttribute('data-theme-preference')).toBe('system')
  })

  it('treats a stored `system` as unusable when no mapping was given', () => {
    stubStorage({ theme: 'system' })
    run(sourceOf(themeScript(MODES)))

    expect(root().getAttribute('data-theme')).toBe('morning')
    expect(root().getAttribute('data-theme-preference')).toBe('morning')
  })
})

describe('the application supplies the names', () => {
  it('bakes in the given names and invents none', () => {
    const source = sourceOf(themeScript(MODES))

    expect(source).toContain('morning')
    expect(source).toContain('night')
    expect(source).not.toContain('light')
    expect(source).not.toContain('dark')
  })

  it('cannot be made to close the script tag early', () => {
    // Mode names come from the application, not the reader, so this is not a
    // reader-facing hole. It is still worth closing: a name carrying `</script`
    // ends the element in the HTML parser, and the rest of the source becomes
    // text in the document.
    const source = sourceOf(themeScript({ modes: ['morning', '</script><script>alert(1)</script>'], defaultMode: 'morning' }))

    expect(source).not.toContain('</script')
  })
})
