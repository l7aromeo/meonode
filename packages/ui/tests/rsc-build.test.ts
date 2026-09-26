import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * What a production build of a MeoNode app emits.
 *
 * Every assertion here reads HTML served by `next start` from a real
 * `next build`, because what it checks exists nowhere else: the rules of a
 * statically prerendered page's server components, pages prerendered one after
 * another by the same build worker, and Cache Components rendering the client
 * tree in two passes. `next dev` never prerenders, so the dev-server suite cannot
 * reach any of it.
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

  // `/wrapped-late` and `/array-late` compile after a macrotask (see `later`), so
  // rules collected at one fixed moment of the render would be missed here every
  // time rather than only when worker scheduling happens to order it so.
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

  // `next/link` from a server component takes the same server-compile path.
  it('#32: a next/link factory rendered from a server component gets its rule', async () => {
    for (const path of ['/link', '/link-late']) {
      const page = await styles(variant, path)
      expect({ path, undefined: page.undefinedClasses }).toEqual({ path, undefined: [] })
    }
  })

  // Pages prerendered one after another by one build worker must not carry each
  // other's rules. Checked as the exact set, so a page carrying another page's
  // rules fails even if it looks styled.
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
    // emitted, so a rule from another page's prerender — the case above — cannot
    // decide this one.
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

  // Every response carries the rules its own render compiled and no other
  // request's. The pages compile after a macrotask (see `later`), so rules
  // collected at one fixed moment would miss them.
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
  // A render carries each rule it compiled once, however many of its elements
  // share it. Several elements share each class here, in one render.
  it('carries each server-compiled rule once per render, however many of its elements use it', async () => {
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

  /** The element's classes, whether each is defined, and its colour at rest, inside a media query, and on hover. */
  async function conflictStates(path: string) {
    const page = await browser!.newPage({ viewport: { width: 400, height: 300 } })
    try {
      await page.goto(`http://localhost:${port(variant)}${path}`, { waitUntil: 'networkidle' })
      const target = page.locator('[data-testid="conflict"]')
      const read = () => target.evaluate(element => getComputedStyle(element).color)
      const { classes, undefinedClasses } = await target.evaluate(element => {
        const loaded = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules].map(rule => rule.cssText)).join(' ')
        const classes = [...element.classList]
        return { classes, undefinedClasses: classes.filter(name => !loaded.includes(`.${name}`)) }
      })
      const rest = await read()
      await page.setViewportSize({ width: 800, height: 300 })
      const media = await read()
      await page.setViewportSize({ width: 400, height: 300 })
      await target.hover()
      const hover = await read()
      return { classes, undefinedClasses, rest, media, hover }
    } finally {
      await page.close()
    }
  }

  /**
   * A caller outside a `'use cache'` scope hands its class to a component inside
   * it, whose compile runs in the scope's own cache. The component finds the
   * class's styles in the store of classes compiled for components and composes
   * it as the client would: one class, the caller's styles winning.
   */
  it('composes a class handed across a use-cache boundary into one class', async () => {
    const result = await conflictStates('/host-tags/cascade-cached')

    expect(result.undefinedClasses).toEqual([])
    expect(result.classes).toHaveLength(1)
    expect(result.rest).toBe('rgb(255, 165, 0)')
  })

  it('composes styles passed into the scope as css into one class', async () => {
    const result = await conflictStates('/host-tags/cascade-cached-css')

    expect(result.undefinedClasses).toEqual([])
    expect(result.classes).toHaveLength(1)
    expect(result.rest).toBe('rgb(255, 165, 0)')
  })

  /**
   * What Emotion's composition gives: the handed styles win at rest, and the
   * component's own hover and media-query rules still win where they apply.
   */
  it('keeps the component’s own nested rules winning across a use-cache boundary', async () => {
    const result = await conflictStates('/host-tags/cascade-cached-states')

    expect(result.classes).toHaveLength(1)
    expect({ rest: result.rest, media: result.media, hover: result.hover }).toEqual({
      rest: 'rgb(255, 165, 0)',
      media: 'rgb(0, 128, 0)',
      hover: 'rgb(0, 0, 255)',
    })
  })

  it('gives interleaved requests into one cached component each their own caller’s styles', async () => {
    const colours = Array.from({ length: 24 }, (_, i) => `rgb(${10 + i}, ${200 - i}, ${i * 3})`)
    const pages = await Promise.all(
      colours.map(async colour => {
        const html = await (await fetch(`http://localhost:${port(variant)}/host-tags/cascade-cached-concurrent?c=${encodeURIComponent(colour)}`)).text()
        const className = html.match(/<div class="([^"]*)" data-testid="conflict"/)?.[1] ?? html.match(/data-testid="conflict"[^>]*class="([^"]*)"/)?.[1] ?? ''
        const rule = html.match(new RegExp(`\\.${className}\\{[^}]*\\}`))?.[0] ?? ''
        return { colour, classes: className.split(' ').filter(Boolean), last: rule.match(/color:(rgb\([^)]*\))[^:]*$/)?.[1] }
      }),
    )

    for (const page of pages)
      expect({ colour: page.colour, classes: page.classes.length, last: page.last }).toEqual({ colour: page.colour, classes: 1, last: page.colour })
  })

  /**
   * Each server-compiled rule reaches the page as one hoisted `<style>`, named by
   * its own class, however many renders carry it and whatever classes sit beside
   * it on the element.
   */
  it('writes a rule used by a render prop and its siblings once', async () => {
    const page = await html('/host-tags/rule-once')
    const hrefs = [...page.matchAll(/<style[^>]*data-href="([^"]*)"/g)].flatMap(match => match[1].split(' '))
    const { undefinedClasses } = await styles(variant, '/host-tags/rule-once')

    for (const testid of ['from-render-prop', 'sibling-a', 'sibling-b']) expect(page).toContain(`data-testid="${testid}"`)
    expect(undefinedClasses).toEqual([])
    expect(hrefs.filter(href => !href.startsWith('meonode-css-'))).toEqual([])
    expect(hrefs.filter((href, index) => hrefs.indexOf(href) !== index)).toEqual([])
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

// A render prop given as the only child of an HTML element is resolved on the
// server, as one inside a children array is; a component beside it still receives
// its render prop to call itself. Prerendered, and at request time inside a
// streamed boundary.
describe.each(['cc', 'plain'] as const)('a render prop as the only child of an HTML element (%s)', variant => {
  it.each(['/render-prop', '/render-prop/request-time'])('renders its result at %s', async route => {
    const response = await fetch(`http://localhost:${port(variant)}${route}`)
    const html = await response.text()
    expect(response.status).toBe(200)
    // Production scrubs the server error to a digest, carried as an error entry in
    // the flight payload; the message itself only reaches the server log.
    expect(html).not.toMatch(/E\{\\"digest\\"/)
    for (const testid of ['bare-plain', 'bare-styled', 'component-target']) expect(html).toContain(`data-testid="${testid}"`)
    for (const text of ['from a render prop', 'from a styled host', 'from the component']) expect(html).toContain(text)
    expect((await styles(variant, route)).undefinedClasses).toEqual([])
  })
})

describe.each(['cc', 'plain'] as const)('a theme token in an at-rule condition or a selector (%s)', variant => {
  let browser: Browser | null = null
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })
  afterAll(async () => {
    await browser?.close()
  })

  // `/themed-at-rules/client` renders the same tree from a client component,
  // which reads the theme from context: the control.
  const PATHS = ['/themed-at-rules/client', '/themed-at-rules', '/themed-at-rules/request-time'] as const

  /**
   * A condition needs the token's concrete value: `var()` is not valid inside a
   * media, container or supports feature, nor in selector text. The theme is
   * provided from a client component, so the server has only the tokens'
   * values to resolve them with.
   */
  it.each(PATHS)('writes the concrete value into every prelude, and no token into any style (%s)', async path => {
    const html = await (await fetch(`http://localhost:${port(variant)}${path}`)).text()
    const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n')
    expect(css).not.toContain('theme.')
    expect(css).toMatch(/@media \(width ?>= ?1000px\)/)
    expect(css).toMatch(/@container \(min-width: ?1000px\)/)
    expect(css).toMatch(/@supports \(width: ?1000px\)/)
    expect(css).toMatch(/\[data-size="1000px"\]/)
  })

  /** What each themed rule does to the element, read from the CSSOM at one viewport width. */
  async function applied(path: string, width: number) {
    const page = await browser!.newPage({ viewport: { width, height: 800 } })
    try {
      await page.goto(`http://localhost:${port(variant)}${path}`, { waitUntil: 'networkidle' })
      return await page.$$eval('[data-case]', elements =>
        Object.fromEntries(
          elements.map(element => {
            const style = getComputedStyle(element)
            return [
              element.getAttribute('data-case'),
              {
                media: style.color === 'rgb(220, 20, 60)',
                container: style.backgroundColor === 'rgb(0, 0, 255)',
                supports: style.borderLeftWidth === '7px',
                selector: style.letterSpacing === '3px',
                nested: style.textDecorationLine === 'underline',
                own: style.paddingLeft === '5px',
              },
            ]
          }),
        ),
      )
    } finally {
      await page.close()
    }
  }

  /** Every shape a page renders: the server pages add components in their own `'use cache'` scope. */
  const shapes = (path: string) => ['host', 'fn', 'composed', 'factory', 'as', ...(path.endsWith('/client') ? [] : ['cached', 'cached-composed'])]
  /** Each shape's expected result, with `own` true only where the component composes css of its own. */
  const each = <T extends object>(names: string[], value: T) =>
    Object.fromEntries(names.map(name => [name, { ...value, own: name.endsWith('composed') }]))

  it.each(PATHS)('applies every themed rule at a wide viewport, and the width conditions only there (%s)', async path => {
    const wide = { media: true, container: true, supports: true, selector: true, nested: true }
    const narrow = { media: false, container: false, supports: true, selector: true, nested: false }
    expect(await applied(path, 1280)).toEqual(each(shapes(path), wide))
    expect(await applied(path, 800)).toEqual(each(shapes(path), narrow))
  })

  // With no theme a token has no value, so a rule keyed on one has nothing to
  // match and is left out, and the page still renders.
  it('leaves out a rule whose key holds a token when no theme is provided', async () => {
    const response = await fetch(`http://localhost:${port(variant)}/themed-at-rules-bare`)
    expect(response.status).toBe(200)
    const html = await response.text()
    const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n')
    expect(css).not.toContain('theme.')
    expect(css).not.toMatch(/@media|@container|@supports|\[data-size=/)
    expect(await applied('/themed-at-rules-bare', 1280)).toEqual(
      each(['host', 'fn', 'composed', 'factory', 'as'], { media: false, container: false, supports: false, selector: false, nested: false }),
    )
  })
})
