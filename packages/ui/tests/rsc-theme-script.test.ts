import { chromium, type Browser, type BrowserContext } from '@playwright/test'
import { themeScript } from '@src/main.js'

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

const expectedSource = (): string => {
  const node = themeScript(FIXTURE_CONFIG) as unknown as { rawProps: Record<string, unknown> }
  return (node.rawProps.dangerouslySetInnerHTML as { __html: string }).__html
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
async function serverDocument(stored: string | null): Promise<{ html: string; mode: string | null; preference: string | null }> {
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
    const response = await page.goto(`${base()}${PAGE}`, { waitUntil: 'domcontentloaded' })
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
    expect(head).toContain(expectedSource())
    expect(head).not.toMatch(/<script[^>]*data-theme[^>]*src=/)
  })

  it('serves the same script on every render, which is what a hash-only CSP requires', async () => {
    const [first, second] = await Promise.all([(await fetch(`${base()}${PAGE}`)).text(), (await fetch(`${base()}${PAGE}`)).text()])
    const extract = (html: string) => html.match(/<script>try\{var m=[\s\S]*?<\/script>/)?.[0]

    expect(extract(first)).toBeDefined()
    expect(extract(second)).toBe(extract(first))
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
