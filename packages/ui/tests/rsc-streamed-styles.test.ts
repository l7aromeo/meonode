import { chromium, type Browser } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Styled content a Next page streams through a Suspense boundary, hydrated in
 * Chromium. The server renders it through Emotion; the client hydrates it with
 * the classes it resolves itself. Every class must match what the
 * server sent, as must the class the server layer compiles for the same css, and
 * React must report no mismatch. A hidden Activity the server never rendered
 * gets its styles when shown.
 */
const base = () => `http://localhost:${process.env.__RSC_FIXTURE_PORT__ as string}`
const PAGE = '/streamed-styles'

/** The client component's elements, each with css of its own. */
const CLIENT_IDS = ['streamed-root', 'streamed-first', 'streamed-inner', 'streamed-deep', 'streamed-toggle'] as const

/** What React and Next print when hydration does not match, or recovers from an error. */
const HYDRATION_REPORT = /hydrat|did not match|recoverable/i

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

/** The `class` of the element with `testId` in served markup. */
function classInMarkup(html: string, testId: string): string | undefined {
  const tag = new RegExp(`<[a-z]+\\b[^>]*\\bdata-testid="${testId}"[^>]*>`).exec(html)?.[0]
  return tag ? /\bclass="([^"]*)"/.exec(tag)?.[1] : undefined
}

/**
 * Loads the page with `stored` as the reader's mode, waits until the streamed
 * content has hydrated, and reads its classes and styles.
 */
async function hydrated(stored: string) {
  const context = await browser!.newContext()
  try {
    const page = await context.newPage()
    await page.addInitScript(mode => localStorage.setItem('theme', mode), stored)
    const messages: string[] = []
    page.on('console', message => void messages.push(message.text()))
    page.on('pageerror', error => void messages.push(error.message))
    await page.goto(`${base()}${PAGE}`, { waitUntil: 'domcontentloaded' })
    // A hidden Activity renders on the client only, so its element appears once
    // the streamed content has hydrated.
    await page.waitForSelector('[data-testid="streamed-activity"]', { state: 'attached' })
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const read = () =>
      page.evaluate(() => {
        const element = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement
        const ids = [
          'streamed-root',
          'streamed-first',
          'streamed-inner',
          'streamed-deep',
          'streamed-toggle',
          'streamed-server-twin',
          'streamed-server-deep',
          'streamed-activity',
        ]
        return {
          classes: Object.fromEntries(ids.map(id => [id, element(id).className])),
          styles: {
            rootColor: getComputedStyle(element('streamed-root')).color,
            firstMarginLeft: getComputedStyle(element('streamed-first')).marginLeft,
            innerMarginTop: getComputedStyle(element('streamed-inner')).marginTop,
            deepPaddingLeft: getComputedStyle(element('streamed-deep')).paddingLeft,
            activityPaddingTop: getComputedStyle(element('streamed-activity')).paddingTop,
          },
        }
      })
    const before = await read()
    await page.click('[data-testid="streamed-toggle"]')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="streamed-activity"]') as HTMLElement).display !== 'none')
    const shown = await read()
    return { before, shown, messages }
  } finally {
    await context.close()
  }
}

describe('styled client content a page streams through a Suspense boundary', () => {
  let html = ''

  beforeAll(async () => {
    html = await (await fetch(`${base()}${PAGE}`)).text()
  })

  it('is streamed: the shell holds the fallback, and the content arrives after it', () => {
    const fallback = html.indexOf('data-testid="streamed-fallback"')
    expect(fallback).toBeGreaterThan(-1)
    expect(html.indexOf('data-testid="streamed-root"')).toBeGreaterThan(fallback)
    expect(html).not.toContain('data-testid="streamed-activity"')
  })

  it('hydrates with the classes the server sent, and those the server layer compiles for the same css', async () => {
    const { before, messages } = await hydrated('morning')
    for (const id of CLIENT_IDS) expect([id, before.classes[id]]).toEqual([id, classInMarkup(html, id)])
    expect(before.classes['streamed-inner']).toBe(before.classes['streamed-server-twin'])
    expect(before.classes['streamed-deep']).toBe(before.classes['streamed-server-deep'])
    expect(before.styles).toMatchObject({ rootColor: 'rgb(4, 5, 6)', firstMarginLeft: '3px', innerMarginTop: '5px', deepPaddingLeft: '7px' })
    expect(messages.filter(message => HYDRATION_REPORT.test(message))).toEqual([])
  })

  it('adopts the reader’s mode for the element whose css reads it, and leaves every other class as the server sent it', async () => {
    const { before, messages } = await hydrated('night')
    expect(before.styles.rootColor).toBe('rgb(1, 2, 3)')
    expect(before.classes['streamed-root']).not.toBe(classInMarkup(html, 'streamed-root'))
    for (const id of CLIENT_IDS.filter(id => id !== 'streamed-root')) expect([id, before.classes[id]]).toEqual([id, classInMarkup(html, id)])
    expect(messages.filter(message => HYDRATION_REPORT.test(message))).toEqual([])
  })

  it('styles a hidden Activity’s content, which the server never rendered, once it is shown', async () => {
    const { shown } = await hydrated('morning')
    expect(shown.styles.activityPaddingTop).toBe('11px')
  })
})
