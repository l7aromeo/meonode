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
// The configuration travels in a `data-` attribute and the body is a constant.
// Nothing an application names is ever interpolated into JavaScript, which puts
// the whole injection class out of reach rather than defending against it, and
// leaves the body with one CSP hash for every application and every config.
//
// What is asserted here is the emitted script and its behaviour. The claim it
// exists to support — that the server's bytes do not move with the stored
// preference — is a whole-document property and lives in the RSC suite.
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Script, themeScript, THEME_SCRIPT_CSP_HASH } from '@src/main.js'

interface Emitted {
  rawProps: Record<string, unknown>
}

/** The constant body the node carries. */
const bodyOf = (node: unknown): string => ((node as Emitted).rawProps.dangerouslySetInnerHTML as { __html: string }).__html

/** The configuration the body will read back out of the DOM. */
const configOf = (node: unknown): string => (node as Emitted).rawProps['data-meonode-theme'] as string

const root = () => document.documentElement

/**
 * Runs the body the way the browser would, but through the documented fallback.
 *
 * `document.currentScript` is null outside a script the parser is executing, so
 * the element is inserted without running and the body finds it by selector.
 * The `currentScript` path is the one a browser actually takes, and it is
 * covered against Chromium in the RSC suite.
 */
const run = (node: unknown, configOverride?: string): void => {
  const host = document.createElement('div')
  host.innerHTML = '<script></script>'
  const element = host.querySelector('script')!
  element.setAttribute('data-meonode-theme', configOverride ?? configOf(node))
  document.head.appendChild(element)
  try {
    new Function(bodyOf(node))()
  } finally {
    element.remove()
  }
}

const MODES = { modes: ['morning', 'night'], defaultMode: 'morning' } as const
const WITH_SYSTEM = { ...MODES, system: { light: 'morning', dark: 'night' } } as const

/**
 * Web Storage, supplied rather than assumed.
 *
 * jsdom's `localStorage` does not reach `globalThis` here — Node's own
 * experimental global shadows it and reports itself unavailable — and the body
 * reads the bare global, exactly as a browser would.
 *
 * `onAccess` throws on *property access* rather than from `getItem`, which is
 * what Chrome does when site data is blocked and what a sandboxed iframe does
 * without `allow-same-origin`. A guard placed around the call but not the
 * lookup would pass a test that threw from `getItem` and still fail for those
 * readers.
 */
const stubStorage = (entries: Record<string, string> = {}, onAccess?: () => never) => {
  const store = new Map(Object.entries(entries))
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  }
  if (onAccess) {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: onAccess })
  } else {
    vi.stubGlobal('localStorage', storage)
  }
}

/** jsdom ships no `matchMedia`; every caller here decides what the OS says. */
const stubMatchMedia = (prefersDark: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({ media: query, matches: prefersDark }))
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (globalThis as Record<string, unknown>).localStorage
  stubStorage()
  root().removeAttribute('data-theme')
  root().removeAttribute('data-theme-preference')
})

describe('the node it returns', () => {
  it('is a plain inline script, not a resource React may hoist or defer', () => {
    const element = themeScript(MODES).render() as unknown as { type: string; props: Record<string, unknown> }

    expect(element.type).toBe('script')
    // A `src` would make this a resource: React 19 hoists and may defer one,
    // which moves it out of the pre-paint window the design depends on.
    expect(element.props.src).toBeUndefined()
    expect(element.props.async).toBeUndefined()
    expect(element.props.defer).toBeUndefined()
  })

  it('carries the configuration in the attribute and nothing but the body inline', () => {
    const node = themeScript(WITH_SYSTEM)

    expect(JSON.parse(configOf(node))).toEqual({
      modes: ['morning', 'night'],
      default: 'morning',
      system: { light: 'morning', dark: 'night' },
      storageKey: 'theme',
    })
    expect(bodyOf(node)).not.toContain('morning')
    expect(bodyOf(node)).not.toContain('night')
  })
})

describe('the body is one constant', () => {
  // The reason the configuration moved out of the source. A body that varied
  // per application would need a CSP hash per application, and a new one every
  // time somebody renamed a mode.
  it('does not move with the configuration', () => {
    const a = bodyOf(themeScript(WITH_SYSTEM))
    const b = bodyOf(themeScript({ modes: ['a'], defaultMode: 'a', storageKey: 'other' }))

    expect(b).toBe(a)
  })

  it('hashes to the value the package publishes for a CSP', () => {
    // Two assertions, and they are not the same one twice.
    //
    // The first is what makes `THEME_SCRIPT_CSP_HASH` trustworthy: it is a
    // literal, so nothing but this check stops it describing a body it no
    // longer covers, and a consumer whose policy names it would then watch the
    // browser refuse to run the script.
    //
    // The second is a golden value, and it exists to make a change to the body
    // visible. Without it both sides could move together and the suite would
    // stay green while every policy already published went stale.
    const digest = `sha256-${createHash('sha256')
      .update(bodyOf(themeScript(MODES)), 'utf8')
      .digest('base64')}`

    expect(THEME_SCRIPT_CSP_HASH).toBe(digest)
    expect(digest).toBe('sha256-VjgrRIgkoFbiLcbmoxDfbf+5fL7BpGm+w6cKK2N2um4=')
  })

  it('survives React unchanged, which is what keeps the hash stable across versions', () => {
    const element = themeScript(MODES).render() as unknown as { props: { dangerouslySetInnerHTML: { __html: string } } }

    // `dangerouslySetInnerHTML` rather than a text child: React runs text
    // children of `<script>` through its own escaper, and an escaper that
    // changes between versions would change the hash.
    expect(element.props.dangerouslySetInnerHTML.__html).toBe(bodyOf(themeScript(MODES)))
  })
})

describe('the configuration attribute', () => {
  it('is byte-identical for the same configuration whatever order it was built in', () => {
    // Insertion order is what `JSON.stringify` follows, so a config assembled
    // one way on the server and another on the client would produce different
    // attributes and a hydration mismatch. The keys are written in a fixed
    // sequence instead.
    const a = themeScript({ modes: ['morning', 'night'], defaultMode: 'morning', system: { light: 'morning', dark: 'night' }, storageKey: 'theme' })
    const b = themeScript({ storageKey: 'theme', system: { dark: 'night', light: 'morning' }, defaultMode: 'morning', modes: ['morning', 'night'] })

    expect(configOf(b)).toBe(configOf(a))
  })

  it('does vary when the configuration does', () => {
    expect(configOf(themeScript({ ...MODES, storageKey: 'ui-theme' }))).not.toBe(configOf(themeScript(MODES)))
  })

  it('omits the system mapping entirely when none was given', () => {
    // Not `"system":null`. The body offers `system` only when the key is there,
    // and an application that never mapped the OS words has not said which of
    // its modes is the dark one.
    expect(JSON.parse(configOf(themeScript(MODES))).system).toBeUndefined()
  })
})

describe('resolving the stored preference', () => {
  it('stamps the stored mode on the document element', () => {
    stubStorage({ theme: 'night' })
    run(themeScript(MODES))

    expect(root().getAttribute('data-theme')).toBe('night')
    expect(root().getAttribute('data-theme-preference')).toBe('night')
  })

  it('stamps the default when nothing is stored', () => {
    run(themeScript(MODES))

    expect(root().getAttribute('data-theme')).toBe('morning')
    expect(root().getAttribute('data-theme-preference')).toBe('morning')
  })

  it('falls back to the default for a value that is no longer a declared mode', () => {
    // A mode the application has since renamed, or a hand-edited value. Left
    // alone it reaches `data-theme`, the provider refuses it, and the attribute
    // is rewritten after hydration — the flash this script exists to remove,
    // for the reader most likely to have an old value.
    stubStorage({ theme: 'twilight' })
    run(themeScript(MODES))

    expect(root().getAttribute('data-theme')).toBe('morning')
    expect(root().getAttribute('data-theme-preference')).toBe('morning')
  })

  it('treats an empty stored value as nothing stored', () => {
    stubStorage({ theme: '' })
    run(themeScript(MODES))

    expect(root().getAttribute('data-theme')).toBe('morning')
  })

  it('reads the storage key it was given', () => {
    stubStorage({ 'ui-theme': 'night' })
    run(themeScript({ ...MODES, storageKey: 'ui-theme' }))

    expect(root().getAttribute('data-theme')).toBe('night')
  })
})

describe('following the system', () => {
  it('resolves to the dark name when the OS says dark', () => {
    stubStorage({ theme: 'system' })
    stubMatchMedia(true)
    run(themeScript(WITH_SYSTEM))

    expect(root().getAttribute('data-theme')).toBe('night')
    // The preference stays `system`, not the mode it resolved to. Storing the
    // resolved mode would pin it: the next OS change would go unnoticed.
    expect(root().getAttribute('data-theme-preference')).toBe('system')
  })

  it('resolves to the light name when the OS says light', () => {
    stubStorage({ theme: 'system' })
    stubMatchMedia(false)
    run(themeScript(WITH_SYSTEM))

    expect(root().getAttribute('data-theme')).toBe('morning')
    expect(root().getAttribute('data-theme-preference')).toBe('system')
  })

  it('never stamps `system` itself when no mapping was configured', () => {
    // `system` is a preference, not a mode. Stamping it leaves every
    // `[data-theme="…"]` selector unmatched, which reaches the reader as an
    // unstyled page.
    stubStorage({ theme: 'system' })
    run(themeScript(MODES))

    expect(root().getAttribute('data-theme')).toBe('morning')
    expect(root().getAttribute('data-theme-preference')).toBe('morning')
  })
})

describe('when the browser refuses to answer', () => {
  // Not throwing is the easy half. The half that matters is that the document
  // still ends up with a mode: an unstyled page is a worse outcome than a wrong
  // one, and every palette is keyed on this attribute.
  it('still applies the default when touching storage throws', () => {
    stubStorage({}, () => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    })

    expect(() => run(themeScript(MODES))).not.toThrow()
    expect(root().getAttribute('data-theme')).toBe('morning')
    expect(root().getAttribute('data-theme-preference')).toBe('morning')
  })

  it('still applies a mode when matchMedia is missing and the reader follows the system', () => {
    stubStorage({ theme: 'system' })

    expect(() => run(themeScript(WITH_SYSTEM))).not.toThrow()
    // The light name, which is what the provider falls back to when it cannot
    // ask either. Agreeing on the guess is what keeps the two from fighting.
    expect(root().getAttribute('data-theme')).toBe('morning')
    expect(root().getAttribute('data-theme-preference')).toBe('system')
  })

  it('still applies a mode when matchMedia throws', () => {
    stubStorage({ theme: 'system' })
    vi.stubGlobal('matchMedia', () => {
      throw new Error('not supported in this context')
    })

    run(themeScript(WITH_SYSTEM))

    expect(root().getAttribute('data-theme')).toBe('morning')
    expect(root().getAttribute('data-theme-preference')).toBe('system')
  })

  it('writes nothing rather than the word undefined when the configuration is truncated', () => {
    // Not reachable through `themeScript`, which refuses such a configuration.
    // The body is a published constant that reads an attribute, though, so it
    // is reachable by hand — and `data-theme="undefined"` matches no palette
    // while looking like the script worked.
    run(themeScript(MODES), '{"modes":["morning"],"storageKey":"theme"}')

    expect(root().getAttribute('data-theme')).toBeNull()
    expect(root().getAttribute('data-theme-preference')).toBeNull()
  })

  it('does nothing at all rather than throwing when its own element cannot be found', () => {
    const node = themeScript(MODES)

    expect(() => new Function(bodyOf(node))()).not.toThrow()
    expect(root().getAttribute('data-theme')).toBeNull()
  })
})

describe('a configuration that cannot work fails where the developer can see it', () => {
  // The alternative is a script that stamps a mode no selector matches, which
  // reaches a reader as an unstyled page and reaches the developer as nothing
  // at all. The configuration is authored, so this is deterministic: it throws
  // on the first render, in every environment, not only where diagnostics are
  // on. A check that fired in development only would let CI pass and production
  // ship the broken page.
  it('refuses a default that is not one of the modes', () => {
    expect(() => themeScript({ modes: ['morning', 'night'], defaultMode: 'twilight' })).toThrow(/defaultMode/)
  })

  it('refuses a system mapping that names a mode that was never declared', () => {
    expect(() => themeScript({ ...MODES, system: { light: 'morning', dark: 'midnight' } })).toThrow(/system/)
  })

  it('refuses an empty mode list, which has nothing to apply', () => {
    expect(() => themeScript({ modes: [], defaultMode: 'morning' })).toThrow(/modes/)
  })

  it('refuses `system` as a mode name, which is the one word a preference already uses', () => {
    expect(() => themeScript({ modes: ['morning', 'system'], defaultMode: 'morning' })).toThrow(/system/)
  })

  it('accepts a single mode, which is the no-toggle setup', () => {
    stubStorage({ theme: 'night' })
    run(themeScript({ modes: ['morning'], defaultMode: 'morning' }))

    expect(root().getAttribute('data-theme')).toBe('morning')
  })
})

describe('names that would be a problem somewhere else', () => {
  // A mode name is the one value that crosses from this configuration into an
  // application's own CSS, which writes `[data-theme="…"]` selectors by hand.
  // Nothing in this library interpolates it into CSS text, so the restriction
  // is for their sake rather than ours.
  it.each([
    ['closes a script tag', 'a</script><script>window.x=1</script>'],
    ['closes an attribute', 'a" onload="alert(1)'],
    ['closes a CSS selector', 'a"] , [data-theme'],
    ['is a lone brace', '{'],
    ['is empty', ''],
    ['is whitespace', ' '],
  ])('refuses a mode name that %s', (_why, name) => {
    expect(() => themeScript({ modes: ['morning', name], defaultMode: 'morning' })).toThrow()
  })

  it('refuses a storage key of the same shape', () => {
    expect(() => themeScript({ ...MODES, storageKey: 'a"]' })).toThrow(/storageKey/)
  })

  it('accepts the names an application would actually pick', () => {
    expect(() => themeScript({ modes: ['morning', 'night', 'high-contrast', 'sepia_2'], defaultMode: 'morning' })).not.toThrow()
  })
})

describe('the attribute cannot carry markup out of the element', () => {
  // The second line of defence, and the reason the configuration moved out of
  // the source in the first place. The names above are refused, so nothing
  // hostile reaches this path through `themeScript` — what is asserted here is
  // that the mechanism itself is inert, by pushing a payload the library would
  // never emit through React's own serialiser and a real parser.
  const HOSTILE = JSON.stringify({
    modes: ['morning', 'a</script><script>window.PWNED=1</script>'],
    default: 'morning',
    storageKey: 'theme',
  })

  const served = (): string =>
    renderToStaticMarkup(Script({ 'data-meonode-theme': HOSTILE, dangerouslySetInnerHTML: { __html: bodyOf(themeScript(MODES)) } }).render() as never)

  it('round-trips a hostile value byte for byte', () => {
    // Byte for byte, not merely "escaped": a value that came back altered would
    // mean the body parsed a different configuration from the one written, and
    // the attribute is the only channel between them.
    const parsed = new DOMParser().parseFromString(`<head>${served()}</head>`, 'text/html')

    expect(parsed.querySelector('script')!.getAttribute('data-meonode-theme')).toBe(HOSTILE)
  })

  it('yields exactly one script element, with nothing escaping into the document', () => {
    const parsed = new DOMParser().parseFromString(`<head>${served()}</head>`, 'text/html')

    expect(parsed.querySelectorAll('script')).toHaveLength(1)
    expect(parsed.body.textContent).toBe('')
    expect(parsed.body.querySelector('script')).toBeNull()
  })

  it('puts no raw angle bracket from the value into the markup', () => {
    // The property this rests on is React's, not ours, so it is asserted rather
    // than assumed: if React ever stopped escaping attribute values, everything
    // above would still pass while the document became injectable.
    const markup = served()
    const attribute = markup.slice(markup.indexOf('data-meonode-theme="') + 20, markup.indexOf('">'))

    expect(attribute).not.toContain('<')
    expect(attribute).toContain('&lt;')
  })
})
