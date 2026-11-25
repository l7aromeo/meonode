import { chromium, type Browser } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { REACT_CONTAINER_KEY, REACT_IDLE_TIMEOUT_MS } from '@tests/_react-idle.js'

/**
 * What the reader actually sees on a cold load.
 *
 * Every other assertion about the pre-paint script is about bytes, attributes or
 * execution — and a page can satisfy all of them and still paint the wrong theme
 * for a fifth of a second. The acceptance criterion is not "the attribute is
 * right", it is "no painted frame shows the wrong theme when the stored mode is
 * not the default".
 *
 * Method, which is the part that took the work:
 *
 * - Sample `document.elementFromPoint(innerWidth / 2, innerHeight / 2)` and walk
 *   up to the first non-transparent `backgroundColor`. Sampling `<html>` or a
 *   guessed wrapper reads `rgba(0, 0, 0, 0)` and reports zero wrong frames while
 *   measuring nothing.
 * - Install the sampler through `addInitScript` on `requestAnimationFrame`, so
 *   it is already running before the first frame.
 * - Run a control in the same file, with the script's body gutted, and assert the
 *   wrong-theme frames *appear*. A flicker probe that has never seen a flicker is
 *   not evidence.
 * - When building that control by rewriting the HTML, drop `content-encoding`
 *   and `content-length` from the forwarded headers. Keeping them serves a body
 *   that does not match its own declared length or encoding: the page renders
 *   nothing, and the control reports zero wrong frames — a control that cannot
 *   fail, which is the failure this whole suite exists to avoid.
 */
const getPort = () => process.env.__RSC_FIXTURE_PORT__ as string
const base = () => `http://localhost:${getPort()}`
const PAGE = '/theme-flicker'

/** The fixture's own palettes, as `theme-fixture.css` declares them. */
const MORNING = 'rgb(250, 250, 252)'
const NIGHT = 'rgb(10, 10, 15)'

/** The fewest sampled frames that show the probe saw the page at all. */
const MIN_FRAMES = 5

/**
 * The frames in a row that must find the page's React root idle. The probe
 * polls once a frame; React's scheduler posts its tasks, passive effects among
 * them, as browser tasks no root field records, and the browser runs those
 * between two frames, so such a task has run by the second, and anything it
 * schedules shows on the root.
 */
const REACT_IDLE_FRAMES = 2

/**
 * The frames sampled once the root is idle, so the window holds the frame its
 * last commit painted.
 */
const FRAMES_AFTER_IDLE = 2

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
    __frames?: string[]
  }
}

/**
 * Every background colour painted at the centre of the viewport, in order.
 * @param stored What the reader had chosen before this load.
 * @param gutScript Serve the page with the pre-paint script's body emptied.
 * @returns The sampled colours, first frame first.
 */
async function framesOnColdLoad(stored: string, gutScript = false): Promise<string[]> {
  const context = await browser!.newContext()
  try {
    await context.addInitScript(() => {
      window.__frames = []
      const sample = () => {
        let element: Element | null = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
        let colour = 'rgba(0, 0, 0, 0)'
        while (element) {
          const background = getComputedStyle(element).backgroundColor
          if (background && background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') {
            colour = background
            break
          }
          element = element.parentElement
        }
        window.__frames!.push(colour)
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })

    const page = await context.newPage()
    await page.addInitScript(mode => localStorage.setItem('theme', mode), stored)

    if (gutScript) {
      await page.route(`${base()}${PAGE}`, async route => {
        const response = await route.fetch()
        const html = await response.text()
        const headers = { ...response.headers() }
        // Both describe the body we are about to replace. Forwarding them serves
        // a corrupted response, which renders nothing and reports no flicker.
        delete headers['content-encoding']
        delete headers['content-length']
        await route.fulfill({
          status: response.status(),
          headers,
          body: html.replace(/(<script[^>]*data-meonode-theme[^>]*>)[\s\S]*?(<\/script>)/, '$1$2'),
        })
      })
    }

    await page.goto(`${base()}${PAGE}`, { waitUntil: 'load' })
    if (gutScript) {
      // A page served through `route.fulfill` gets no React root on `document`
      // under `next dev`, its body changed or not, so the control shows the
      // served HTML and CSS alone, and waits for the frames it reads.
      await page.waitForFunction(min => (window.__frames?.length ?? 0) > min, MIN_FRAMES, { polling: 'raf', timeout: REACT_IDLE_TIMEOUT_MS })
      return await page.evaluate(() => window.__frames ?? [])
    }
    // Next hydrates the whole document, so its root is on `document`. Until
    // React has committed everything it has to do there, adopting the stored
    // mode included, a later frame could still show the wrong theme.
    await page.waitForFunction(
      ({ key, frames }) => {
        const marked = Object.keys(document).find(name => name.startsWith(key))
        if (!marked) return false
        const root = (document as unknown as Record<string, { stateNode?: { pendingLanes?: unknown; callbackNode?: unknown } } | null>)[marked]?.stateNode
        if (!root || typeof root.pendingLanes !== 'number' || !('callbackNode' in root)) {
          throw new Error('no React FiberRoot with pendingLanes and callbackNode on the document')
        }
        const w = window as { __idleFrames?: number }
        w.__idleFrames = root.pendingLanes === 0 && root.callbackNode === null ? (w.__idleFrames ?? 0) + 1 : 0
        return w.__idleFrames >= frames
      },
      { key: REACT_CONTAINER_KEY, frames: REACT_IDLE_FRAMES },
      { polling: 'raf', timeout: REACT_IDLE_TIMEOUT_MS },
    )
    return await page.evaluate(
      frames =>
        new Promise<string[]>(resolve => {
          const next = (left: number) => (left ? requestAnimationFrame(() => next(left - 1)) : resolve(window.__frames ?? []))
          next(frames)
        }),
      FRAMES_AFTER_IDLE,
    )
  } finally {
    await context.close()
  }
}

describe('a cold load with a stored mode that is not the default', () => {
  it('paints no frame in the default mode', async () => {
    const frames = await framesOnColdLoad('night')

    // Non-vacuity: the probe has to have seen the page at all.
    expect(frames.length).toBeGreaterThan(MIN_FRAMES)
    expect(frames[0]).toBe(NIGHT)
    expect(frames.filter(colour => colour === MORNING)).toEqual([])
  }, 60_000)

  it('and the same page without the script does paint them, which is what makes the first case evidence', async () => {
    const frames = await framesOnColdLoad('night', true)

    expect(frames.length).toBeGreaterThan(MIN_FRAMES)
    // The document's own default: React never takes this page's document, so
    // nothing adopts the stored mode.
    expect(frames[0]).toBe(MORNING)
    expect(frames.filter(colour => colour === MORNING).length).toBeGreaterThan(0)
  }, 60_000)

  it('leaves a reader on the default alone', async () => {
    const frames = await framesOnColdLoad('morning')
    expect(frames.length).toBeGreaterThan(MIN_FRAMES)
    expect(frames.filter(colour => colour === NIGHT)).toEqual([])
  }, 60_000)
})
