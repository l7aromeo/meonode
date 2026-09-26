import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

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
  /** The ids those blocks declare, with repeats. */
  declaredIds: string[]
  /** Distinct `meonode-css-*` class names in the markup. */
  classes: string[]
  /** Classes no `<style>` on the page defines. */
  undefinedClasses: string[]
}

async function styles(variant: 'cc' | 'plain', path: string): Promise<Styles> {
  const html = await (await fetch(`http://localhost:${port(variant)}${path}`)).text()
  const blocks = [...html.matchAll(/<style data-emotion="([^"]*)"[^>]*>[\s\S]*?<\/style>/g)]
  // Any <style> can define a rule, whatever mechanism emitted it — so a rule is
  // only "missing" if no stylesheet on the page defines its class.
  const allCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('')
  const classes = [...new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap(match => match[1].split(/\s+/)).filter(name => name.startsWith('meonode-css-')))]
  return {
    blocks: blocks.map(match => match[0]),
    declaredIds: blocks.flatMap(match => match[1].split(' ').slice(1)),
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
  it.fails('#34: a statically prerendered page defines every class its server components compiled', async () => {
    for (const path of ['/wrapped', '/wrapped-late']) {
      const page = await styles(variant, path)
      expect({ path, classes: page.classes.length }).toEqual({ path, classes: 4 })
      expect({ path, undefined: page.undefinedClasses }).toEqual({ path, undefined: [] })
    }
  })

  // #32, not fixed yet: `next/link` from a server component takes the same
  // server-compile path as #34, and loses its rule the same way.
  it.fails('#32: a next/link factory rendered from a server component gets its rule', async () => {
    for (const path of ['/link', '/link-late']) {
      const page = await styles(variant, path)
      expect({ path, undefined: page.undefinedClasses }).toEqual({ path, undefined: [] })
    }
  })

  // Found with #34, not fixed yet: rules a prerender failed to collect surface
  // on the next page the same worker prerenders. Checked as the exact set, so a
  // page carrying another page's rules fails even if it looks styled.
  it.fails('a prerendered page carries exactly its own rules, not another page’s', async () => {
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
  it.fails('each response carries exactly its own server-compiled rules', async () => {
    const paths = Array.from({ length: 24 }, (_, i) => (i % 2 ? '/dynamic-b' : '/dynamic-a'))
    const results = await Promise.all(paths.map(async path => ({ path, page: await styles(variant, path) })))
    for (const { path, page } of results) {
      expect({ path, classes: page.classes.length }).toEqual({ path, classes: 4 })
      expect({ path, undefined: page.undefinedClasses }).toEqual({ path, undefined: [] })
      expect({ path, ids: unique(page.declaredIds) }).toEqual({ path, ids: idsOf(page.classes) })
    }
  })
})
