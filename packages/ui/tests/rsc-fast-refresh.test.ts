import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Fast Refresh in `next dev`: editing a client component's styles restyles the open
 * page with the new class, keeps the component's state, and leaves nothing of the
 * old style behind. The test edits the fixture and puts it back in `finally`.
 */
const base = () => `http://localhost:${process.env.__RSC_FIXTURE_PORT__ as string}`
const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'rsc-fixtures/next-app/app/_components/refresh-edited.ts')
/** How long a refresh may take to reach the page under a loaded machine. */
const REFRESH_TIMEOUT_MS = 30_000

let browser: Browser | null = null
const original = readFileSync(FILE, 'utf8')

beforeAll(async () => {
  try {
    browser = await chromium.launch({ headless: true })
  } catch (error) {
    throw new Error(`Failed to launch Playwright Chromium. Run "bunx playwright install chromium" and retry.\n${String(error)}`, { cause: error })
  }
})

afterAll(async () => {
  writeFileSync(FILE, original)
  await browser?.close()
  browser = null
})

describe('a client component whose styles are edited while the page is open', () => {
  it('restyles from the new values, keeps its state, and goes back when the edit is undone', async () => {
    const page = await browser!.newPage()
    let loads = 0
    page.on('load', () => loads++)
    try {
      await page.goto(`${base()}/fast-refresh`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.documentElement.dataset.hydrated !== undefined)
      await page.click('[data-testid="refresh-counter"]')
      await page.click('[data-testid="refresh-counter"]')
      const read = () =>
        page.evaluate(() => {
          const element = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement
          return {
            counter: element('refresh-counter').textContent,
            padding: getComputedStyle(element('refresh-edited')).paddingLeft,
            color: getComputedStyle(element('refresh-edited')).color,
            childMargin: getComputedStyle(element('refresh-child')).marginLeft,
            classes: element('refresh-edited').className,
          }
        })
      const before = await read()
      expect(before).toMatchObject({ counter: 'count 2', padding: '11px', color: 'rgb(0, 0, 11)', childMargin: '3px' })

      writeFileSync(
        FILE,
        original.replace('paddingLeft: 11', 'paddingLeft: 12').replace("'rgb(0, 0, 11)'", "'rgb(0, 0, 12)'").replace('marginLeft: 3', 'marginLeft: 5'),
      )
      await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="refresh-edited"]') as HTMLElement).paddingLeft === '12px', null, {
        timeout: REFRESH_TIMEOUT_MS,
      })
      const edited = await read()
      expect(edited).toMatchObject({ counter: 'count 2', padding: '12px', color: 'rgb(0, 0, 12)', childMargin: '5px' })
      expect(edited.classes).not.toBe(before.classes)

      writeFileSync(FILE, original)
      await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="refresh-edited"]') as HTMLElement).paddingLeft === '11px', null, {
        timeout: REFRESH_TIMEOUT_MS,
      })
      const restored = await read()
      expect(restored).toEqual({ ...before })
      expect(loads).toBe(1)
    } finally {
      writeFileSync(FILE, original)
      await page.close()
    }
  })
})
