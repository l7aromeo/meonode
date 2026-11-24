import { createHash } from 'node:crypto'
import type { Page } from '@playwright/test'

/** Inline `<script>` only: one with a `src` is covered by the URL rules. */
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g

/** The `style-src` of meonode-docs, whose policy MeoNode's styles are held to: inline styles allowed, as Emotion needs. */
export const DOCS_STYLE_SRC = "style-src 'self' 'unsafe-inline'"

/** A `style-src` without `'unsafe-inline'`, which no MeoNode release supports; its violations prove the check can see one. */
export const STRICT_STYLE_SRC = "style-src 'self'"

/**
 * meonode-docs' Content Security Policy, with `script-src` filled in as its
 * hash proxy fills it: the hash of every inline script the page was sent. The
 * named external hosts are left out, since the fixture loads none.
 */
function docsPolicy(html: string, styleSrc: string, dev: boolean): string {
  const hashes = [...new Set([...html.matchAll(INLINE_SCRIPT)].map(([, body]) => createHash('sha256').update(body, 'utf8').digest('base64')))]
  return [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    `script-src ${hashes.map(hash => `'sha256-${hash}'`).join(' ')} 'self'${dev ? " 'unsafe-eval'" : ''}`,
    styleSrc,
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'self'",
    "form-action 'self'",
  ].join('; ')
}

/**
 * Serves `page`'s documents under meonode-docs' policy, as its proxy does, and
 * records every violation the browser reports.
 * @returns The violations so far, as `effectiveDirective blockedURI`, read with `page.evaluate`.
 */
export async function underDocsPolicy(page: Page, { styleSrc = DOCS_STYLE_SRC, dev }: { styleSrc?: string; dev: boolean }): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as { __cspViolations?: string[] }).__cspViolations = seen
    document.addEventListener('securitypolicyviolation', event => void seen.push(`${event.effectiveDirective} ${event.blockedURI}`))
  })
  await page.route('**/*', async route => {
    if (route.request().resourceType() !== 'document') return route.continue()
    const response = await route.fetch()
    const body = await response.text()
    await route.fulfill({ response, body, headers: { ...response.headers(), 'content-security-policy': docsPolicy(body, styleSrc, dev) } })
  })
  return () => page.evaluate(() => (window as { __cspViolations?: string[] }).__cspViolations ?? [])
}
