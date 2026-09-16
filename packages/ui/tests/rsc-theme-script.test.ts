import { createHash } from 'node:crypto'
import { chromium, type Browser, type BrowserContext } from '@playwright/test'
import { renderToStaticMarkup } from 'react-dom/server'
import { themeScript, THEME_SCRIPT_CSP_HASH } from '@src/main.js'

/**
 * The pre-paint theme script, through a real server render.
 *
 * This is the half that cannot be asserted under jsdom, which sees a client
 * render and never a document. The claim the mode-aware theme rests on is a
 * property of the bytes the server sends: they do not move with what the reader
 * stored. That is what lets one cached document serve everybody, and it is why
 * the mode has to be applied by a script in `<head>` instead of being baked into
 * the markup.
 *
 * Two assertions here would pass for the wrong reason on their own. Identical
 * bytes prove nothing if nothing varies per reader, so the divergence control
 * below checks that the two readers really do end up in different modes. And
 * comparing two documents means nothing unless two identical requests already
 * agree, so the stability control fetches the same page twice first.
 */
const getPort = () => process.env.__RSC_FIXTURE_PORT__ as string
const base = () => `http://localhost:${getPort()}`
const PAGE = '/theme-script'

/** The same configuration the fixture's root layout passes. A drift on either side fails here. */
const FIXTURE_CONFIG = {
  modes: ['morning', 'night'],
  defaultMode: 'morning',
  system: { light: 'morning', dark: 'night' },
} as const

/**
 * Removes the one thing in the document that varies per request rather than per
 * reader: the id the dev server mints for each render. It carries no theme
 * information, and leaving it in would make every comparison here fail for a
 * reason that has nothing to do with the subject.
 */
const stable = (html: string): string => html.replace(/self\.__next_r="[^"]*"/g, 'self.__next_r="<per-request>"')

/** The page whose markup legitimately varies per reader, and only exists to prove the comparison can fail. */
const VARYING_PAGE = '/theme-script-varying'

const expectedBody = (): string => {
  const node = themeScript(FIXTURE_CONFIG) as unknown as { rawProps: Record<string, unknown> }
  return (node.rawProps.dangerouslySetInnerHTML as { __html: string }).__html
}

const sha256 = (value: string): string => `sha256-${createHash('sha256').update(value, 'utf8').digest('base64')}`

/** The script element as served, body and configuration attribute together. */
const servedScript = (html: string): { tag: string; body: string; index: number } => {
  const match = html.match(/<script data-meonode-theme=(?:"[^"]*"|'[^']*')>([\s\S]*?)<\/script>/)
  if (!match) throw new Error(`no pre-paint script in the served head:\n${html.slice(0, 1024)}`)
  return { tag: match[0], body: match[1], index: match.index! }
}

let browser: Browser | null = null

beforeAll(async () => {
  try {
    browser = await chromium.launch({ headless: true })
  } catch (error) {
    throw new Error(`Failed to launch Playwright Chromium. Run "bunx playwright install chromium" and retry.\n${String(error)}`, { cause: error })
  }
})

afterAll(async () => {
  await browser?.close()
  browser = null
})

declare global {
  interface Window {
    __firstTheme?: { mode: string | null; preference: string | null }
  }
}

/**
 * The document as the server sent it, together with what the pre-paint script
 * made of it.
 *
 * The mode is read from the *first* write rather than from the element later.
 * This fixture's root layout also mounts the legacy `ThemeProvider`, whose hook
 * stamps its own `data-theme` on mount, so an attribute read after hydration
 * answers a question about that hook and not about this script. An init script
 * — which Playwright runs before any of the page's own — records the first
 * value instead, which is precisely the pre-paint one.
 */
async function serverDocument(stored: string | null, path: string = PAGE): Promise<{ html: string; mode: string | null; preference: string | null }> {
  const context: BrowserContext = await browser!.newContext()
  try {
    // Seeded as a cookie as well as in storage, and that is the half that can
    // actually fail. `localStorage` is never sent anywhere, so a comparison of
    // two documents built from storage alone could not come out unequal however
    // the library behaved. A cookie does reach the server — the legacy provider
    // writes one on every change — so this is the channel through which a mode
    // could start showing up in the markup, and the only one worth guarding.
    if (stored !== null) {
      await context.addCookies([{ name: 'theme', value: stored, url: base() }])
    }
    await context.addInitScript(value => {
      if (value !== null) {
        try {
          localStorage.setItem('theme', value)
        } catch {
          /* the seed is the test's own doing; a failure here is not the subject */
        }
      }
      // Observed on `document`, not on `document.documentElement`: an init
      // script runs before the parser has produced any element, so there is
      // nothing yet to attach to. Watching the document with `subtree` catches
      // the attribute on an element that does not exist at this point.
      new MutationObserver((records, observer) => {
        for (const record of records) {
          if (record.attributeName !== 'data-theme') continue
          window.__firstTheme = {
            mode: document.documentElement.getAttribute('data-theme'),
            preference: document.documentElement.getAttribute('data-theme-preference'),
          }
          observer.disconnect()
          return
        }
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-theme'] })
    }, stored)

    const page = await context.newPage()
    const response = await page.goto(`${base()}${path}`, { waitUntil: 'domcontentloaded' })
    const html = await response!.text()
    const first = await page.evaluate(() => window.__firstTheme ?? { mode: null, preference: null })
    return { html, ...first }
  } finally {
    await context.close()
  }
}

describe('the pre-paint theme script in a server document', () => {
  it('is served inside <head>, inline, where a hoisted resource could not be', async () => {
    const html = await (await fetch(`${base()}${PAGE}`)).text()
    const head = html.slice(html.indexOf('<head'), html.indexOf('</head>'))

    // Not `toContain` on the whole document: the point is the position. React
    // hoists a `<script src>` and may defer it, which would move it out of the
    // window between the document element existing and the first paint.
    expect(head).toContain(servedScript(html).tag)
    expect(servedScript(html).tag).not.toMatch(/\ssrc=/)
  })

  it('is served ahead of the stylesheet, which would otherwise block it from running', async () => {
    // Authored in that order in the root layout. Asserted because neither React
    // nor Next promises to keep it: a stylesheet hoisted above this script would
    // delay it until that sheet loaded, and the delay is the whole thing the
    // script avoids.
    //
    // React does put a `<link rel="preload" as="style">` for the same sheet
    // ahead of the script. That is not the same element and does not block
    // execution, so the match is on `rel="stylesheet"` and not on the filename —
    // matching the filename finds the preload and reports a problem that is not
    // there.
    const html = await (await fetch(`${base()}${PAGE}`)).text()
    const stylesheet = html.indexOf('<link rel="stylesheet" href="/theme-fixture.css"')

    expect(stylesheet).toBeGreaterThan(-1)
    expect(servedScript(html).index).toBeLessThan(stylesheet)
  })

  it('serves a body that is one constant, at the hash a CSP would be published with', async () => {
    // End to end rather than in a unit test: what a CSP hashes is the bytes in
    // the document, after React has serialised them and Next has streamed them.
    // Anything in that path that re-encoded the body would invalidate a header
    // already published, and nothing earlier in the pipeline would notice.
    const html = await (await fetch(`${base()}${PAGE}`)).text()

    expect(servedScript(html).body).toBe(expectedBody())
    expect(sha256(servedScript(html).body)).toBe(THEME_SCRIPT_CSP_HASH)
  })

  it('keeps the application names out of the body and in the attribute', async () => {
    // The reason the body is constant: nothing an application names is ever
    // interpolated into source, so there is no context for a mode name to
    // escape from and no per-application hash.
    const { tag, body } = servedScript(await (await fetch(`${base()}${PAGE}`)).text())

    expect(body).not.toContain('morning')
    expect(body).not.toContain('night')
    expect(tag).toContain('morning')
    // The attribute value alone, not the tag: React escapes what it puts there,
    // so nothing the configuration carries can reach the document as markup.
    const value = tag.slice(tag.indexOf('=') + 2, tag.indexOf('>') - 1)
    expect(value).toContain('&quot;')
    expect(value).not.toContain('<')
  })

  it('serves the same script on every render, which is what a hash-only CSP requires', async () => {
    const [first, second] = await Promise.all([(await fetch(`${base()}${PAGE}`)).text(), (await fetch(`${base()}${PAGE}`)).text()])

    expect(servedScript(second).tag).toBe(servedScript(first).tag)
  })

  it('sends the same bytes to two readers who stored different modes', async () => {
    // The stability control: two identical requests have to agree before a
    // comparison between two different readers means anything. It is also what
    // found the one thing that does move — a per-request id the dev server
    // stamps — and `stable` takes that out. Everything else is compared as sent,
    // so anything that starts varying per request fails here.
    const [a, b] = await Promise.all([(await fetch(`${base()}${PAGE}`)).text(), (await fetch(`${base()}${PAGE}`)).text()])
    expect(stable(b)).toBe(stable(a))

    const morning = await serverDocument('morning')
    const night = await serverDocument('night')
    const untouched = await serverDocument(null)

    expect(stable(night.html)).toBe(stable(morning.html))
    expect(stable(untouched.html)).toBe(stable(morning.html))

    // The divergence control. Without it the assertion above holds trivially for
    // a page where nothing reads the preference at all.
    expect(morning.mode).toBe('morning')
    expect(night.mode).toBe('night')
    expect(night.mode).not.toBe(morning.mode)
  })

  it('tells two readers apart when the markup really does differ', async () => {
    // The negative control for the comparison itself. `/theme-script-varying`
    // reads the cookie on the server and renders it, so its documents are
    // genuinely different. If this passed, the assertion above would only be
    // telling us the comparison never ran — which is the shape of failure that
    // has caught this project before.
    const morning = await serverDocument('morning', VARYING_PAGE)
    const night = await serverDocument('night', VARYING_PAGE)

    expect(stable(night.html)).not.toBe(stable(morning.html))
  })

  it('records the preference as stored, not as resolved, so following the system stays possible', async () => {
    const followingSystem = await serverDocument('system')

    expect(followingSystem.preference).toBe('system')
    expect(['morning', 'night']).toContain(followingSystem.mode)
  })

  it('leaves a stale mode name unstamped rather than handing the provider one it will reject', async () => {
    const stale = await serverDocument('twilight')

    expect(stale.mode).toBe('morning')
    expect(stale.preference).toBe('morning')
  })
})

describe('the published CSP hash, against a browser that enforces it', () => {
  /**
   * The claim `THEME_SCRIPT_CSP_HASH` makes is that a policy naming it lets this
   * script run. Hashing the served bytes, as the case above does, is not the
   * same claim: it says our arithmetic agrees with itself. What decides is
   * whether a browser, given that source expression and this element, executes
   * it — and the failure when it does not is silent, because a blocked pre-paint
   * script leaves a page that still settles into the right mode after hydration.
   *
   * Composed here rather than served by the fixture, because a policy tight
   * enough to be meaningful — one hash and nothing else — would block every
   * inline script Next emits and take the page down for reasons unrelated to
   * this one. The markup comes from React's own serialiser so that nothing in
   * this file is escaping the attribute on the library's behalf.
   */
  const documentWith = (policy: string): string => {
    const element = renderToStaticMarkup(themeScript(FIXTURE_CONFIG).render() as never)
    return `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="script-src ${policy}">${element}</head><body>x</body></html>`
  }

  const modeUnder = async (policy: string): Promise<string | null> => {
    const context: BrowserContext = await browser!.newContext()
    try {
      const page = await context.newPage()
      await page.setContent(documentWith(policy), { waitUntil: 'domcontentloaded' })
      return await page.locator('html').getAttribute('data-theme')
    } finally {
      await context.close()
    }
  }

  it('lets the script run when the policy names it', async () => {
    expect(await modeUnder(`'${THEME_SCRIPT_CSP_HASH}'`)).toBe('morning')
  })

  it('does not when the policy names a stale one, which is what proves the case above', async () => {
    // The control. Without it, the assertion above would pass on a browser that
    // ignored the policy entirely — and `page.setContent` is exactly the kind of
    // document where that would be easy to believe.
    const stale = THEME_SCRIPT_CSP_HASH.replace(/^sha256-../, 'sha256-AA')

    expect(await modeUnder(`'${stale}'`)).toBeNull()
  })
})
