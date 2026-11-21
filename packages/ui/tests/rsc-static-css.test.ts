import { chromium, type Browser } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DOCS_STYLE_SRC, STRICT_STYLE_SRC, underDocsPolicy } from './_docs-csp.js'

/**
 * Compiled output with extracted styles in a Next app, written by hand in the
 * contract's shape: a server component with static and runtime css, a client
 * component that registers its own module, and a server component streamed in
 * through a Suspense boundary after the shell. Served by `next dev` and hydrated
 * in Chromium.
 */
const base = () => `http://localhost:${process.env.__RSC_FIXTURE_PORT__ as string}`
const PAGE = '/static-css'

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

/** Every `useId` reader on the page: inside and after a fast-path subtree, in the server tree and the client tree. */
const ID_PROBES = ['id-probe-value-static-inside-server', 'id-probe-value-static-after-server', 'static-client-label-inside', 'static-client-label-after']

/** Each probe's id in served markup, by test id. */
function idsIn(html: string): Record<string, string> {
  const ids: Record<string, string> = {}
  for (const match of html.matchAll(/data-testid="((?:id-probe-value-static|static-client-label)-[a-z-]+)"[^>]*>([^<]+)</g)) ids[match[1]] = match[2]
  return Object.fromEntries(ID_PROBES.filter(probe => probe in ids).map(probe => [probe, ids[probe]]))
}

/** The precedence groups of the head's hoisted styles, in document order, with each group's hrefs. */
function groupsIn(html: string): [string, string][] {
  const head = html.slice(0, html.indexOf('</head>'))
  return [...head.matchAll(/<style data-precedence="([^"]+)" data-href="([^"]*)"/g)].map(match => [match[1], match[2]])
}

describe('extracted styles in a Next app', () => {
  it('serves the static css in the head, in bucket order and before the runtime rules', async () => {
    const html = await (await fetch(`${base()}${PAGE}`)).text()
    const groups = groupsIn(html)
    const precedences = groups.map(([precedence]) => precedence)

    expect(precedences.slice(0, 4)).toEqual(['mn-static-0', 'mn-static-1', 'mn-static-2', 'mn-static-3'])
    expect(precedences.slice(4)).toContain('meonode')
    const hrefs = groups.slice(0, 4).map(([, href]) => href)
    expect(hrefs[0]).toContain('mn-static-fixture-server-0')
    expect(hrefs[0]).toContain('mn-static-fixture-client-0')
    expect(hrefs[2]).toContain('mn-static-fixture-server-2')
    // The streamed module is not in the shell's head.
    expect(hrefs.join(' ')).not.toContain('fixture-late')
    expect(html).toContain('mn-static-fixture-late-0')
  })

  it('hydrates with no mismatch, applies every rule, and inserts nothing the server sent', async () => {
    const context = await browser!.newContext()
    try {
      const page = await context.newPage()
      const messages: string[] = []
      page.on('console', message => void messages.push(message.text()))
      page.on('pageerror', error => void messages.push(error.message))
      const serverHtml = await (await fetch(`${base()}${PAGE}`)).text()
      const serverIds = idsIn(serverHtml)
      expect(Object.keys(serverIds)).toEqual(ID_PROBES)
      await page.goto(`${base()}${PAGE}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('[data-testid="static-late"]')
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-hydrated') || !!(window as { next?: unknown }).next)
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

      const state = await page.evaluate(() => {
        const style = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!)
        return {
          server: [style('static-server').color, style('static-server').paddingLeft],
          serverPartial: [style('static-server-partial').color, style('static-server-partial').padding],
          client: [style('static-client').color, style('static-client').width],
          clientPartial: [style('static-client-partial').color, style('static-client-partial').padding],
          late: style('static-late').marginTop,
          ids: Object.fromEntries(
            [...document.querySelectorAll('[data-testid^="static-client-label-"], [data-testid^="id-probe-value-static-"]')].map(element => [
              element.getAttribute('data-testid'),
              element.textContent,
            ]),
          ),
          ownRules: [...document.querySelectorAll<HTMLStyleElement>('style[data-meonode-static]')].reduce(
            (sum, element) => sum + element.sheet!.cssRules.length,
            0,
          ),
          precedences: [...document.head.querySelectorAll('style[data-precedence]')].map(element => element.getAttribute('data-precedence')),
        }
      })

      expect(messages.filter(message => HYDRATION_REPORT.test(message))).toEqual([])
      expect(state.server).toEqual(['rgb(255, 0, 0)', '7px'])
      expect(state.serverPartial).toEqual(['rgb(255, 0, 0)', '4px'])
      expect(state.client).toEqual(['rgb(0, 0, 255)', '40px'])
      expect(state.clientPartial).toEqual(['rgb(0, 0, 255)', '5px'])
      expect(state.late).toBe('3px')
      expect(state.ids).toEqual(serverIds)
      expect(state.ownRules).toBe(0)
      // The streamed module joined its buckets' groups; the order held.
      const firstRuntime = state.precedences.indexOf('meonode')
      const lastStatic = Math.max(...state.precedences.map((precedence, i) => (precedence?.startsWith('mn-static-') ? i : -1)))
      expect(lastStatic).toBeLessThan(firstRuntime)
    } finally {
      await context.close()
    }
  })

  /**
   * The page under meonode-docs' policy, which MeoNode's styles are held to: the
   * static rules, the runtime rules and the variables of extracted values must
   * all apply with no violation. The same page under a `style-src` without
   * `'unsafe-inline'`, which MeoNode does not support, shows the check sees one.
   */
  it.each([
    ['meonode-docs’ policy', DOCS_STYLE_SRC, true],
    ['a strict style-src', STRICT_STYLE_SRC, false],
  ] as const)('under %s, applies every value: %s', async (_, styleSrc, allowed) => {
    const page = await browser!.newPage()
    try {
      const violations = await underDocsPolicy(page, { styleSrc, dev: true })
      const messages: string[] = []
      page.on('console', message => void messages.push(message.text()))
      await page.goto(`${base()}${PAGE}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('[data-testid="static-late"]')
      const width = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="static-client"]')!).width)
      const color = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="static-server"]')!).color)
      const seen = await violations()

      if (allowed) {
        expect(seen).toEqual([])
        expect(messages.filter(message => /hydrat|did not match|recoverable/i.test(message))).toEqual([])
        expect([width, color]).toEqual(['40px', 'rgb(255, 0, 0)'])
      } else {
        expect(seen.some(violation => violation.startsWith('style-src-attr'))).toBe(true)
        expect(width).not.toBe('40px')
      }
    } finally {
      await page.close()
    }
  })
})
