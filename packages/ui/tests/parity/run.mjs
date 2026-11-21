// The styling parity suite: renders every corpus case on the runtime path (the
// oracle) and compiled with extraction off and on, server-renders and hydrates
// each in installed Chrome, and fails on any difference, on a coverage gap, or
// on a planted failure that goes uncaught.
//
// Needs a built dist (`bun run build:ui` at the repository root) and the
// compiler wasm (`bun run build:compiler`).
//
// usage: NODE_ENV=production node tests/parity/run.mjs [--plants] [--case=<name>]
// Settings, from the environment:
// - PARITY_WASM: the compiler wasm (default: packages/compiler/npm/meonode_swc_plugin.wasm here)
// - PARITY_ON_UI: the packages/ui dir whose dist the "on" side uses (default: this package)
// - PARITY_ON_OPTIONS: JSON plugin options for the "on" side (default: { "experimental_extractCss": true })
// - PARITY_SIDES: sides to compare against the oracle, comma-separated (default: off,on)
// - PARITY_LOAD_MAX: wait for the 1-minute load average to fall under this before the browser phase (default 10)
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { loadavg } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, URL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { buildSide, caseNames, PACKAGE } from './build.mjs'
import { collect } from './collect.mjs'
import { compareRecords, DIMENSIONS } from './compare.mjs'
import { coverageProblems } from './inventory.mjs'
import { PLANT_CASE, PLANTS } from './plants.mjs'

if (process.env.NODE_ENV !== 'production') throw new Error('run with NODE_ENV=production: the oracle is the production runtime')
const require = createRequire(join(PACKAGE, 'package.json'))
const { chromium } = require('@playwright/test')

const args = process.argv.slice(2)
const PLANT_RUN = args.includes('--plants')
const ONLY = args.find(a => a.startsWith('--case='))?.slice('--case='.length)
const WASM = process.env.PARITY_WASM ?? join(PACKAGE, '../compiler/npm/meonode_swc_plugin.wasm')
const ON_UI = process.env.PARITY_ON_UI ?? PACKAGE
const ON_OPTIONS = JSON.parse(process.env.PARITY_ON_OPTIONS ?? '{"experimental_extractCss":true}')
const COMPARED = (process.env.PARITY_SIDES ?? 'off,on').split(',')
const LOAD_MAX = Number(process.env.PARITY_LOAD_MAX ?? 10)
/** How long to wait for the load average to fall before giving up. */
const LOAD_WAIT_MS = 20 * 60_000
/** Extraction markers in compiled output; a case tagged with an extracted route must carry one on the "on" side. */
const EXTRACTION_MARKERS = ['__meo$s', '__meo$v']
const ORIGIN = 'http://parity.localhost'

const SIDES = {
  runtime: { name: 'runtime', ui: PACKAGE, plugin: null },
  off: { name: 'off', ui: PACKAGE, plugin: [WASM, { experimental_extractCss: false }] },
  on: { name: 'on', ui: ON_UI, plugin: [WASM, ON_OPTIONS] },
}

const names = PLANT_RUN ? [PLANT_CASE] : caseNames().filter(n => !ONLY || n === ONLY)
const sides = PLANT_RUN ? ['runtime', 'off'] : ['runtime', ...COMPARED]
console.log(`parity: ${names.length} case(s); sides ${sides.join(', ')}; wasm ${existsSync(WASM) ? WASM : '(missing)'}`)

// 1. Build each side, server-render it in its own process.
const built = {}
for (const s of sides) {
  const { dir, compiled } = await buildSide(SIDES[s], names)
  const ssr = JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, 'ssr.mjs'), dir, ...names], { env: process.env, maxBuffer: 1 << 28 }).toString())
  built[s] = { dir, compiled, ssr, client: readFileSync(join(dir, 'client.js'), 'utf8') }
}

// 2. The coverage gate, and the extraction markers' non-vacuity check.
const metas = []
for (const name of names) metas.push({ name, meta: (await import(pathToFileURL(join(built.runtime.dir, 'corpus', `${name}.mjs`)).href)).meta })
const problems = PLANT_RUN || ONLY ? [] : coverageProblems(metas)
if (built.on && Object.values(built.on.compiled).some(code => EXTRACTION_MARKERS.some(m => code.includes(m)))) {
  for (const { name, meta } of metas) {
    const extracted = meta.routes.some(r => ['STATIC', 'SWITCH', 'VAR'].includes(r))
    if (extracted && !meta.leftOnRuntime?.length && !EXTRACTION_MARKERS.some(m => built.on.compiled[name].includes(m))) problems.push(`${name}: tagged with an extracted route but its "on" output has no extraction marker`)
  }
} else if (built.on) {
  console.log('parity: the "on" side carries no extraction markers yet, so it equals "off"; the marker check is off')
}
for (const p of problems) console.log(`COVERAGE ${p}`)

// 3. The browser phase, once the machine is quiet enough.
const started = Date.now()
while (loadavg()[0] >= LOAD_MAX) {
  if (Date.now() - started > LOAD_WAIT_MS) throw new Error(`the load average stayed at or above ${LOAD_MAX}`)
  console.log(`parity: load ${loadavg()[0].toFixed(2)}, waiting for under ${LOAD_MAX}`)
  await sleep(30_000)
}
console.log(`parity: browser phase at load ${loadavg()[0].toFixed(2)}`)

/** Installed Chrome with no window, so nothing takes the user's focus. */
const browser = await chromium.launch({ channel: 'chrome', headless: true })
console.log(`parity: ${browser.version()}`)

/** Serves one case page of one side, in one server-render mode, with an optional plant on its server HTML. */
async function open(side, name, mode, plantHtml) {
  const { head, body } = built[side].ssr[mode][name]
  const { PAGE_CSS } = await import(pathToFileURL(join(built.runtime.dir, 'shell.mjs')).href)
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style>${head}</head><body><div id="root">${plantHtml ? plantHtml(body) : body}</div><script src="/${side}/client.js"></script><script>__parity.start(${JSON.stringify(name)}, ${mode === 'registry'})</script></body></html>`
  return { html, url: `${ORIGIN}/${side}/${name}/${mode}` }
}

const context = { pages: new Map() }
const host = {
  async newPage() {
    const page = await browser.newPage()
    await page.route(`${ORIGIN}/**`, route => {
      const path = new URL(route.request().url()).pathname
      const client = path.match(/^\/(\w+)\/client\.js$/)
      if (client) return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: built[client[1]].client })
      const html = context.pages.get(path)
      return html ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }) : route.fulfill({ status: 404, body: '' })
    })
    return page
  },
}

/** Collects one side's record of a case, with its server HTML. */
async function record(side, name, mode, meta, plant) {
  const { html, url } = await open(side, name, mode, plant?.html)
  context.pages.set(new URL(url).pathname, html)
  return { record: await collect(host, url, meta, plant?.page ?? null), html: built[side].ssr[mode][name].body }
}

let failures = problems.length
try {
  if (PLANT_RUN) {
    const meta = metas[0].meta
    const oracle = await record('runtime', PLANT_CASE, 'plain', meta)
    const clean = compareRecords(oracle, await record('off', PLANT_CASE, 'plain', meta))
    if (clean.length) {
      failures++
      console.log(`FAIL the unplanted comparison is not clean: ${clean.slice(0, 5).map(d => `${d.dimension} ${d.text}`).join(' | ')}`)
    }
    for (const plant of PLANTS) {
      const side = await record('off', PLANT_CASE, 'plain', meta, plant)
      if (plant.html) side.html = plant.html(side.html)
      const found = compareRecords(oracle, side)
      const caught = found.some(d => d.dimension === plant.dimension)
      if (!caught) failures++
      console.log(`${caught ? 'caught' : 'MISSED'} plant ${plant.dimension}: ${found.length} difference(s) in ${[...new Set(found.map(d => d.dimension))].join(', ') || 'none'}`)
    }
    const planted = new Set(PLANTS.map(p => p.dimension))
    for (const d of DIMENSIONS) if (!planted.has(d)) console.log(`note: dimension ${d} has no plant`)
  } else {
    for (const { name, meta } of metas) {
      for (const mode of ['plain', 'registry']) {
        const errors = sides.map(s => [s, built[s].ssr[mode][name].error]).filter(([, e]) => e)
        if (errors.length) {
          failures += errors.length
          for (const [s, e] of errors) console.log(`FAIL ${name} [${mode}] ${s}: the server render threw: ${e.split('\n').slice(0, 3).join(' | ')}`)
          continue
        }
        let oracle
        try {
          oracle = await record('runtime', name, mode, meta)
        } catch (error) {
          failures++
          console.log(`FAIL ${name} [${mode}] runtime: the oracle page failed: ${error.message}`)
          continue
        }
        for (const side of COMPARED) {
          let found
          try {
            found = compareRecords(oracle, await record(side, name, mode, meta))
          } catch (error) {
            found = [{ dimension: 'hydration', where: 'page', text: `the page failed: ${error.message}` }]
          }
          failures += found.length
          const byDimension = Object.groupBy(found, d => d.dimension)
          const first = Object.values(oracle.record.envs)[0].styles
          const size = `${first.elements.length} elements × ${first.props.length} properties × 3 parts, ${Object.keys(oracle.record.envs).length} environments, ${Object.keys(oracle.record.forced).length} forced states, ${Object.keys(oracle.record.steps).length} steps`
          console.log(`${found.length ? 'FAIL' : 'ok  '} ${name} [${mode}] ${side}: ${found.length ? Object.entries(byDimension).map(([d, l]) => `${d} ${l.length}`).join(', ') : `identical (${size})`}`)
          for (const d of found.slice(0, 8)) console.log(`       ${d.dimension} @ ${d.where}: ${d.text}`)
        }
      }
    }
  }
} finally {
  await browser.close()
}
console.log(failures ? `parity: FAILED (${failures})` : PLANT_RUN ? 'parity: every plant caught' : 'parity: all identical')
process.exitCode = failures ? 1 : 0
