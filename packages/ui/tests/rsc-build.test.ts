import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * What a production build of a MeoNode app actually emits.
 *
 * Every assertion here reads HTML served by `next start` from a real
 * `next build`, because the failures it covers do not exist anywhere else: a
 * statically prerendered page losing the rules its server components compiled,
 * the next page prerendered in the same worker emitting them instead, and every
 * emotion rule emitted twice when Cache Components renders the client tree in
 * two passes. `next dev` never prerenders, so the dev-server suite cannot reach
 * any of it.
 *
 * Each page has styling of its own, so a rule in a response can be attributed:
 * "this page has its rules" is checked as the exact set, which also catches a
 * page carrying another page's rules.
 */
const port = (variant: 'cc' | 'plain') => process.env[`__BUILD_PORT_${variant.toUpperCase()}__`] as string

interface Styles {
  /** Every `<style data-emotion>` block, verbatim. */
  blocks: string[]
  /** The ids those blocks and any hoisted `precedence` styles declare, with repeats. */
  declaredIds: string[]
  /** Distinct `meonode-css-*` class names in the markup. */
  classes: string[]
  /** Classes no `<style>` on the page defines. */
  undefinedClasses: string[]
}

async function styles(variant: 'cc' | 'plain', path: string): Promise<Styles> {
  const html = await (await fetch(`http://localhost:${port(variant)}${path}`)).text()
  const blocks = [...html.matchAll(/<style data-emotion="([^"]*)"[^>]*>[\s\S]*?<\/style>/g)]
  // React 19 hoists `<style href precedence>` into `<head>` and coalesces every
  // one of a precedence into a single element, listing their hrefs. Inside a
  // streamed Suspense boundary the element arrives first as `media="not all"`
  // and is enabled on reveal, so attribute order is not fixed.
  const hoisted = [...html.matchAll(/<style[^>]*\bdata-precedence="meonode"[^>]*\bdata-href="([^"]*)"[^>]*>/g)].flatMap(match =>
    match[1].split(' ').map(href => href.slice('meonode-css-'.length)),
  )
  // Any <style> can define a rule, whatever mechanism emitted it — so a rule is
  // only "missing" if no stylesheet on the page defines its class.
  const allCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('')
  const classes = [...new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap(match => match[1].split(/\s+/)).filter(name => name.startsWith('meonode-css-')))]
  return {
    blocks: blocks.map(match => match[0]),
    declaredIds: [...blocks.flatMap(match => match[1].split(' ').slice(1)), ...hoisted],
    classes,
    undefinedClasses: classes.filter(name => !allCss.includes(`.${name}`)),
  }
}

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'rsc-fixtures/next-build')
const COMPILED = process.env.MEONODE_COMPILED === '1'

/**
 * Compiled call sites carry the schema marker as an object key — `__meo$:2,`.
 * The library's own code names the same keys only as strings, so this count is
 * zero for an uncompiled build and positive for a compiled one.
 */
function callSiteMarkers(distDir: string): number {
  const root = path.resolve(FIXTURE, distDir, 'server')
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(name => name.endsWith('.js'))
  return files.reduce((count, name) => count + (readFileSync(path.resolve(root, name), 'utf8').match(/__meo\$:\d,/g)?.length ?? 0), 0)
}

const idsOf = (classes: string[]) => classes.map(name => name.slice('meonode-css-'.length)).sort()
const unique = (ids: string[]) => [...new Set(ids)].sort()

describe.each(['cc', 'plain'] as const)('a production build (%s)', variant => {
  it(`is ${COMPILED ? '' : 'not '}compiled, as this run claims`, () => {
    // Without this a broken compiled configuration would build the plain app
    // twice and report two identical green suites.
    const markers = callSiteMarkers(variant === 'cc' ? '.next-cc' : '.next-plain')
    if (COMPILED) expect(markers).toBeGreaterThan(0)
    else expect(markers).toBe(0)
  })

  it('is serving the build it claims to', async () => {
    // Non-vacuity, through a path no bug here touches: rules the registry's own
    // emotion cache collects. If this fails the harness is broken, not the
    // library.
    const page = await styles(variant, '/emotion-static')
    expect(page.classes).toHaveLength(4)
    expect(page.undefinedClasses).toEqual([])
  })

  it('#35: every rule is emitted once', async () => {
    for (const path of ['/', '/emotion-static']) {
      const page = await styles(variant, path)
      expect({ path, blocks: page.blocks.length }).toEqual({ path, blocks: 1 })
      expect({ path, repeats: page.declaredIds.length - new Set(page.declaredIds).size }).toEqual({ path, repeats: 0 })
    }
  })

  // #34 (second half), not fixed yet. Server-compiled rules reach the flush only
  // if they are compiled before the registry drains a process-global bucket,
  // once. `/wrapped-late` pins the compile after that moment, so this fails
  // every time rather than whenever worker scheduling happens to lose.
  it('#34: a statically prerendered page defines every class its server components compiled', async () => {
    for (const [path, count] of [
      ['/wrapped', 4],
      ['/wrapped-late', 4],
      ['/array-late', 2],
    ] as const) {
      const page = await styles(variant, path)
      expect({ path, classes: page.classes.length }).toEqual({ path, classes: count })
      expect({ path, undefined: page.undefinedClasses }).toEqual({ path, undefined: [] })
    }
  })

  it('gives every element its class when several share one', async () => {
    // Four server-compiled elements, three of them the same class. A compile
    // path that answers only the first request for an id leaves the others with
    // no class: the page still "defines every class it uses", because the
    // classes it lost are not in the markup to be checked.
    const html = await (await fetch(`http://localhost:${port(variant)}/shared-class`)).text()
    const rows = [...html.matchAll(/<div( class="([^"]*)")?>(first|second) \d<\/div>/g)].map(match => match[2] ?? '')
    expect(rows).toHaveLength(4)
    expect(rows.filter(name => name.startsWith('meonode-css-'))).toHaveLength(4)
    expect(new Set(rows).size).toBe(2)
  })

  // #32, not fixed yet: `next/link` from a server component takes the same
  // server-compile path as #34, and loses its rule the same way.
  it('#32: a next/link factory rendered from a server component gets its rule', async () => {
    for (const path of ['/link', '/link-late']) {
      const page = await styles(variant, path)
      expect({ path, undefined: page.undefinedClasses }).toEqual({ path, undefined: [] })
    }
  })

  // Found with #34, not fixed yet: rules a prerender failed to collect surface
  // on the next page the same worker prerenders. Checked as the exact set, so a
  // page carrying another page's rules fails even if it looks styled.
  it('a prerendered page carries exactly its own rules, not another page’s', async () => {
    for (const path of ['/', '/emotion-static', '/link', '/wrapped', '/wrapped-late']) {
      const page = await styles(variant, path)
      expect({ path, ids: unique(page.declaredIds) }).toEqual({ path, ids: idsOf(page.classes) })
    }
  })
})

describe('Cache Components against the same app without them', () => {
  it('#35: emits every rule the page needs, so the dedupe has dropped nothing', async () => {
    // One block is not enough: a dedupe that stood the second pass down could
    // emit fewer rules than the page needs. So both builds must define every
    // class the page's own markup uses — the same markup in each, so the same
    // set — and the Cache Components build must do it from its single block.
    //
    // Compared on the page's own classes rather than on everything each build
    // emitted, because the plain build's pages can also carry rules leaked from
    // another page's prerender (#34's finding, tested above). That is a
    // different defect, and it would make this test measure it instead.
    for (const path of ['/', '/emotion-static']) {
      const [cc, plain] = await Promise.all([styles('cc', path), styles('plain', path)])
      const own = idsOf(cc.classes)
      expect(own.length).toBeGreaterThan(0)
      expect({ path, markup: idsOf(plain.classes) }).toEqual({ path, markup: own })
      expect({ path, cc: unique(cc.declaredIds).filter(id => own.includes(id)) }).toEqual({ path, cc: own })
      expect({ path, plain: unique(plain.declaredIds).filter(id => own.includes(id)) }).toEqual({ path, plain: own })
    }
  })
})

describe.each(['cc', 'plain'] as const)('concurrent requests (%s)', variant => {
  it('#35: renders flushing at the same time do not share a flushed-id set', async () => {
    // The registry's dedupe is keyed per render. Keyed on anything wider — a
    // module-level set, one instance for the process — the second of two
    // concurrent requests would find its ids "already flushed" and emit nothing.
    const paths = Array.from({ length: 24 }, (_, i) => (i % 2 ? '/emotion-b' : '/emotion-a'))
    const results = await Promise.all(paths.map(async path => ({ path, page: await styles(variant, path) })))
    for (const { path, page } of results) {
      expect({ path, classes: page.classes.length }).toEqual({ path, classes: 2 })
      expect({ path, blocks: page.blocks.length }).toEqual({ path, blocks: 1 })
      expect({ path, ids: unique(page.declaredIds) }).toEqual({ path, ids: idsOf(page.classes) })
    }
  })

  // #34 (second half), not fixed yet: with one process-global bucket, a
  // request's server-compiled rules can be drained by another request, and ones
  // compiled after the drain — pinned here by `later` — are never collected by
  // their own. Expected to fail until those rules travel with the RSC output.
  it('each response carries exactly its own server-compiled rules', async () => {
    const paths = Array.from({ length: 24 }, (_, i) => (i % 2 ? '/dynamic-b' : '/dynamic-a'))
    const results = await Promise.all(paths.map(async path => ({ path, page: await styles(variant, path) })))
    for (const { path, page } of results) {
      expect({ path, classes: page.classes.length }).toEqual({ path, classes: 4 })
      expect({ path, undefined: page.undefinedClasses }).toEqual({ path, undefined: [] })
      expect({ path, ids: unique(page.declaredIds) }).toEqual({ path, ids: idsOf(page.classes) })
    }
  })
})

describe.each(['cc', 'plain'] as const)('the flight payload (%s)', variant => {
  // Not fixed yet (#34): server-compiled rules do not travel in the payload at
  // all. Once they do, each must travel once per request: a <style> per
  // element put 200 of them into a 200-row page and made its payload five times
  // larger than the unstyled one. Several elements share each class here.
  it('carries each server-compiled rule once, however many elements use it', async () => {
    const html = await (await fetch(`http://localhost:${port(variant)}/shared-class`)).text()
    const flight = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map(match => match[1]).join('')
    const hrefs = [...flight.matchAll(/\\"href\\":\\"(meonode-css-[a-z0-9]+)\\"/g)].map(match => match[1])
    expect(hrefs.length).toBeGreaterThan(0)
    expect(hrefs.length).toBe(new Set(hrefs).size)
  })
})

describe('equal-specificity rules on one element', () => {
  let browser: Browser | null = null
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })
  afterAll(async () => {
    await browser?.close()
  })

  /**
   * The applied colour and left padding, and whether each of the element's classes is defined in
   * a stylesheet the browser actually loaded. Read from the CSSOM rather than
   * the HTML: inside a streamed boundary a hoisted style arrives as
   * `media="not all"` wherever it streams and React moves it into `<head>` on
   * reveal, so its position in the HTML text is not its position in the cascade.
   */
  async function conflict(variant: 'cc' | 'plain', path: string) {
    const page = await browser!.newPage()
    try {
      await page.goto(`http://localhost:${port(variant)}${path}`, { waitUntil: 'networkidle' })
      return await page.$eval('[data-testid="conflict"]', element => {
        const loaded = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules].map(rule => rule.cssText)).join(' ')
        return {
          colour: getComputedStyle(element).color,
          paddingLeft: getComputedStyle(element).paddingLeft,
          classes: [...element.classList]
            .filter(name => name.startsWith('meonode-css-'))
            .map(name => ({ name, defined: loaded.includes(`.${name} `) || loaded.includes(`.${name}{`) })),
        }
      })
    } finally {
      await page.close()
    }
  }

  // A className handed to a component that styles itself composes with the
  // component's own css the way Emotion's `css` prop composes one: into a single
  // class, with the className's declarations after the component's, so the
  // caller wins a conflict and the component's other declarations still apply.
  // That class must be defined in a loaded stylesheet.
  const composed = async (variant: 'cc' | 'plain', path: string) => {
    const result = await conflict(variant, path)
    expect(result.classes).toHaveLength(1)
    expect(result.classes.every(entry => entry.defined)).toBe(true)
    expect(result.colour).toBe('rgb(255, 165, 0)')
    expect(result.paddingLeft).toBe('7px')
  }

  it.each([
    ['cc', '/cascade'],
    ['plain', '/cascade'],
    ['cc', '/cascade-dynamic'],
    ['plain', '/cascade-dynamic'],
  ] as const)('an incoming className composes over the component’s own css (%s %s)', composed)

  // The component renders inside its own `'use cache'` scope and the caller
  // outside it.
  it.fails.each([
    ['cc', '/cascade-cached-card'],
    ['plain', '/cascade-cached-card'],
  ] as const)('an incoming className composes over the css of a component in its own cache scope (%s %s)', composed)
})

describe.each(['cc', 'plain'] as const)('a refresh that moves a rule’s first occurrence (%s)', variant => {
  let browser: Browser | null = null
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })
  afterAll(async () => {
    await browser?.close()
  })

  /**
   * RSC output is reconciled against the live client tree on every refresh, so
   * an element whose type depends on whether it is the first to use its rule
   * changes type when a reorder moves that first occurrence — and React remounts
   * a node whose type changed at a keyed position, dropping any client state in
   * it. `/refresh-order` moves the shared rule's first occurrence from row `a`
   * to row `b`; row `c` is never first and is the control.
   *
   * Counts are read only after `Committed` reports the new order, because React
   * flushes all of a commit's passive effects together: once it has run, every
   * remounted row has counted itself, so "one mount each" cannot mean "the
   * remount had not happened yet".
   */
  it('keeps every row mounted', async () => {
    const page = await browser!.newPage()
    try {
      await page.goto(`http://localhost:${port(variant)}/refresh-order`, { waitUntil: 'networkidle' })
      await page.waitForFunction(() => window.__committedOrder === 'abc')
      const before = await page.evaluate(() => ({ ...window.__mounts }))

      await page.click('[data-testid="reorder"]')
      await page.waitForFunction(() => window.__committedOrder === 'bac')
      const after = await page.evaluate(() => ({ ...window.__mounts }))

      expect(before).toEqual({ a: 1, b: 1, c: 1 })
      expect(after).toEqual({ a: 1, b: 1, c: 1 })
    } finally {
      await page.close()
    }
  })
})

describe.each(['cc', 'plain'] as const)('server-compiled rules and the tree around them (%s)', variant => {
  const hiddenPanel = async (path: string) => {
    const page = await styles(variant, path)
    expect(page.classes).toHaveLength(1)
    expect(page.undefinedClasses).toEqual([])
  }

  /**
   * A render can be handed to a client component that never renders it — a
   * closed dialog, an inactive tab. Whatever it shares a rule with must still
   * find that rule on the page. `/hidden-panel-open` is the same page with the
   * panel rendered.
   */
  it('a visible element has its rule when the panel sharing it is rendered', () => hiddenPanel('/hidden-panel-open'))
  it('a visible element keeps its rule when a panel sharing it is never rendered', () => hiddenPanel('/hidden-panel'))

  const slottedTag = async (path: string) => {
    const response = await fetch(`http://localhost:${port(variant)}${path}`)
    expect(response.status).toBe(200)
    return (await response.text()).match(/<(?:button|input|a)\b[^>]*\bdata-testid="slotted"[^>]*>/)?.[0]
  }

  /**
   * A styled element handed to a parent that clones its child — an `asChild`
   * slot — must reach it as that element, still styled. Passing the styled node
   * to the slot as a child compiles it within the page's own render.
   * `/slot-root-bare` is a server component with no css.
   */
  it.each(['/slot-root-bare', '/slot-child', '/slot-link'])('a slot clones a styled child (%s)', async path => {
    expect(await slottedTag(path)).toMatch(/\bdata-cloned="yes"/)
    const page = await styles(variant, path)
    expect(page.classes).toHaveLength(path === '/slot-root-bare' ? 0 : 1)
    expect(page.undefinedClasses).toEqual([])
  })

  /**
   * The documented limitation: a render whose root is a component or a void
   * element has no host to carry its rules, so they travel beside the root and
   * the component's output reaches the client as an array. A slot that clones
   * its child receives no single element and renders nothing.
   */
  it.each(['/slot-root', '/slot-void'])('a slot cannot clone a server component whose own render has no host (%s)', async path => {
    expect(await slottedTag(path)).toBeUndefined()
  })
})

describe.each(['cc', 'plain'] as const)('host tags rendered by a server component (%s)', variant => {
  let browser: Browser | null = null
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })
  afterAll(async () => {
    await browser?.close()
  })

  const html = async (path: string) => (await fetch(`http://localhost:${port(variant)}${path}`)).text()
  /** The RSC payload as the page streams it: the string bodies of every flight push. */
  const flightOf = (page: string) => [...page.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map(match => match[1]).join('')
  /** Rows carrying a server-compiled class. A host whose only child was text renders `text<!-- -->` once its rules follow it. */
  const classedRows = (page: string) => page.match(/<div[^>]*class="[^"]*meonode-css-[a-z0-9]+[^"]*"[^>]*>Row \d+(<!-- -->)?<\/div>/g)?.length ?? 0

  /**
   * The payload is the point of compiling these on the server: a host tag handed
   * to `StyledRenderer` puts that client component and its whole css object into
   * the flight payload for every element. Compiled here, it carries a class name
   * and one rule, and no reference to the client component at all.
   */
  it.each(['/host-tags/payload', '/host-tags/payload-per-root'])('carries class names and rules, not css objects (%s)', async path => {
    const page = await html(path)
    const flight = flightOf(page)
    const { undefinedClasses } = await styles(variant, path)

    expect(classedRows(page)).toBe(200)
    expect(undefinedClasses).toEqual([])
    expect(flight).not.toContain('styled-renderer')
    expect(flight).not.toContain('\\"borderRadius\\":6')
  })

  /**
   * Composition needs the caller's class in the cache the component compiles in.
   * Across a `'use cache'` boundary the component compiles in the scope's own
   * cache, so the caller's class stays a separate class beside the component's
   * and the component's own colour wins. This is the documented limitation;
   * without the boundary the two compose into one class and the caller's wins.
   */
  it('keeps two classes across a use-cache boundary, the component’s own winning', async () => {
    const page = await browser!.newPage()
    try {
      await page.goto(`http://localhost:${port(variant)}/host-tags/cascade-cached`, { waitUntil: 'networkidle' })
      const result = await page.$eval('[data-testid="conflict"]', element => {
        const loaded = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules].map(rule => rule.cssText)).join(' ')
        const classes = [...element.classList]
        return { colour: getComputedStyle(element).color, classes, undefinedClasses: classes.filter(name => !loaded.includes(`.${name}`)) }
      })
      expect(result.undefinedClasses).toEqual([])
      expect(result.classes).toHaveLength(2)
      expect(result.colour).toBe('rgb(0, 128, 128)')
    } finally {
      await page.close()
    }
  })

  it('keeps a pseudo-class, a media query and a theme token working', async () => {
    const page = await browser!.newPage({ viewport: { width: 800, height: 600 } })
    try {
      await page.goto(`http://localhost:${port(variant)}/host-tags/hover`, { waitUntil: 'networkidle' })
      const target = page.locator('[data-testid="hover"]')
      const read = () =>
        target.evaluate(element => ({
          color: getComputedStyle(element).color,
          paddingLeft: getComputedStyle(element).paddingLeft,
          border: getComputedStyle(element).borderTopColor,
        }))

      const wide = await read()
      await target.hover()
      const hovered = await read()
      await page.setViewportSize({ width: 400, height: 600 })
      await page.mouse.move(0, 0)
      const narrow = await read()

      expect(wide).toEqual({ color: 'rgb(106, 4, 15)', paddingLeft: '17px', border: 'rgb(0, 128, 0)' })
      expect(hovered.color).toBe('rgb(0, 0, 255)')
      expect(narrow.paddingLeft).toBe('0px')
    } finally {
      await page.close()
    }
  })

  /**
   * A server component whose output is one styled host element reaches the client
   * as that element, so a parent cloning its child still can. The host carries
   * its own rule in its children; nothing wraps it.
   */
  it('lets a slot clone a styled host root', async () => {
    const page = await html('/host-tags/slot-host')
    const element = page.match(/<button\b[^>]*\bdata-testid="slotted"[^>]*>/)?.[0] ?? 'not rendered'
    const { classes, undefinedClasses } = await styles(variant, '/host-tags/slot-host')

    expect(element).toMatch(/\bdata-cloned="yes"/)
    expect(classes).toHaveLength(1)
    expect(undefinedClasses).toEqual([])
  })

  /**
   * A client component's host tags keep `StyledRenderer` on the server, because
   * the browser renders them that way when it hydrates. `/host-tags/client-mismatch`
   * is the control: it renders different text on each side, so a hydration error
   * must be seen there, or silence on `/host-tags/client` would mean nothing.
   */
  const hydrate = async (path: string) => {
    const page = await browser!.newPage()
    const errors: string[] = []
    page.on('console', message => message.type() === 'error' && errors.push(message.text()))
    page.on('pageerror', error => errors.push(error.message))
    try {
      const served = await html(path)
      await page.goto(`http://localhost:${port(variant)}${path}`, { waitUntil: 'networkidle' })
      const hydrated = await page.locator('[data-testid]').first().getAttribute('class')
      const servedClass = served.match(/data-testid="client-[a-z-]+"[^>]*class="([^"]*)"|class="([^"]*)"[^>]*data-testid="client-[a-z-]+"/)
      // A production build reports hydration failures as minified React errors
      // (react.dev/errors/418 and its neighbours), not as the development text.
      const hydrationError = /hydrat|react\.dev\/errors\/(418|419|423|425)|Minified React error #(418|419|423|425)/i
      return { errors: errors.filter(text => hydrationError.test(text)), hydrated, served: servedClass?.[1] ?? servedClass?.[2] }
    } finally {
      await page.close()
    }
  }

  it('hydrates a client component’s host tags with no mismatch', async () => {
    const result = await hydrate('/host-tags/client')

    expect(result.errors).toEqual([])
    expect(result.hydrated).toBe(result.served)
  })

  it('does report a mismatch where there is one', async () => {
    expect((await hydrate('/host-tags/client-mismatch')).errors.length).toBeGreaterThan(0)
  })

  /**
   * A function component given `css` inside a client component, passing the
   * class on to its own styled element: the server's pass must produce the one
   * composed class the browser does.
   */
  it('hydrates a client component’s styled function component with no mismatch', async () => {
    const result = await hydrate('/host-tags/client-function')

    expect(result.errors).toEqual([])
    expect(result.served?.split(' ')).toHaveLength(1)
    expect(result.hydrated).toBe(result.served)
  })
})
