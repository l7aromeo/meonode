import { chromium, type Browser } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * A server component that changes its module-level style objects in place on each
 * request: the top-level css object, an object nested in css, and the props object
 * itself, each with plain values and with theme tokens. A cache keyed on the
 * object rather than its contents would serve the first request's styles again.
 */
const base = () => `http://localhost:${process.env.__RSC_FIXTURE_PORT__ as string}`

/** The fixture's `primary` token, and `base.default` resolved by its stylesheet in the default mode. */
const PRIMARY = 'rgb(255, 107, 107)'
const BASE = 'rgb(250, 250, 252)'
const EXPECTED = {
  '0': { top: 'rgb(0, 0, 1)', topToken: PRIMARY, nested: 'rgb(0, 0, 1)', nestedToken: PRIMARY, props: '1px', propsToken: PRIMARY },
  '1': { top: 'rgb(200, 0, 1)', topToken: BASE, nested: 'rgb(200, 0, 2)', nestedToken: BASE, props: '9px', propsToken: BASE },
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

describe('style objects a server component changes in place between requests', () => {
  it('are styled from what they hold on each request', async () => {
    for (const error of ['0', '1', '0', '1'] as const) {
      const page = await browser!.newPage()
      try {
        await page.goto(`${base()}/mutated-styles?error=${error}`, { waitUntil: 'load' })
        const read = await page.evaluate(() => {
          const style = (id: string, prop: string) => getComputedStyle(document.querySelector(`[data-testid="${id}"]`) as HTMLElement).getPropertyValue(prop)
          return {
            top: style('top', 'color'),
            topToken: style('top-token', 'color'),
            nested: style('nested', 'color'),
            nestedToken: style('nested-token', 'color'),
            props: style('props', 'padding-left'),
            propsToken: style('props-token', 'border-top-color'),
          }
        })
        expect([error, read]).toEqual([error, EXPECTED[error]])
      } finally {
        await page.close()
      }
    }
  })
})
