// The styling parity suite: renders every corpus case on the runtime path (the
// oracle) and compiled with extraction off and on, server-renders and hydrates
// each in a headless browser, and fails on any difference, on a coverage gap,
// or on a planted failure that goes uncaught.
//
// Needs a built dist (`bun run build:ui` at the repository root), the compiler
// wasm (`bun run build:compiler`) and the mui build (`bun run build:mui`).
//
// usage: NODE_ENV=production node tests/parity/run.mjs [--plants] [--case=<name>] [--no-browser]
// --no-browser stops after the build, the coverage gate and the routing checks.
// Settings, from the environment:
// - PARITY_WASM: the compiler wasm (default: packages/compiler/npm/meonode_swc_plugin.wasm here)
// - PARITY_ON_UI: the packages/ui dir whose dist the "on" side uses (default: this package)
// - PARITY_ON_OPTIONS: JSON plugin options for the "on" side (default: { "experimental_extractCss": true })
// - PARITY_SIDES: sides to compare against the oracle, comma-separated (default: off,on)
// - PARITY_LOAD_MAX: wait for the 1-minute load average to fall under this before the browser phase (default 10)
// - PARITY_BROWSER: chromium (installed Chrome, the default), webkit or firefox, all headless
// - PARITY_FORCE: input, to force pseudo-classes through real input in Chromium too
// - PARITY_DETAIL: how many differences to print per failing comparison (default 8)
// - PARITY_REPORT: a file to write every difference, and each case's time in the browser phase, to, as JSON
// - PARITY_GRAMMAR: the selector grammar module to generate pages from (default: the compiler's tests/selector-grammar.ts)
// - PARITY_GRAMMAR_CASES: a JSON file of grammar case names, to generate only those
// - PARITY_SHARD: k/n, to run only the k-th of n interleaved slices of the cases, without the
//   coverage gate (which a --no-browser run checks for every case), so CI can split a run into jobs
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { loadavg } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, URL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { buildSide, caseNames, isRscCase, PACKAGE } from './build.mjs'
import { collect } from './collect.mjs'
import { compareExact, compareRecords, compareRuleText, DIMENSIONS } from './compare.mjs'
import { writeGeneratedCases } from './generate.mjs'
import { ATRULES, atruleGaps, parsesAtrules } from './atrules.mjs'
import { SELECTORS, selectorGaps } from './selectors.mjs'
import { coverageProblems, EXTRACTED_ROUTES } from './inventory.mjs'
import { COMPILED_PLANTS, PLANT_CASE, PLANTS } from './plants.mjs'
import { routingProblems } from './routing.mjs'

if (process.env.NODE_ENV !== 'production') throw new Error('run with NODE_ENV=production: the oracle is the production runtime')
const require = createRequire(join(PACKAGE, 'package.json'))
const engines = require('@playwright/test')
const { compile } = require('stylis')

const args = process.argv.slice(2)
const PLANT_RUN = args.includes('--plants')
/** `--case=<name>[,<name>…]`: only these cases, without the coverage gate. */
const ONLY = args
  .find(a => a.startsWith('--case='))
  ?.slice('--case='.length)
  .split(',')
const NO_BROWSER = args.includes('--no-browser')
const SHARD = process.env.PARITY_SHARD?.match(/^(\d+)\/(\d+)$/)?.slice(1).map(Number)
if (process.env.PARITY_SHARD && !(SHARD && SHARD[0] >= 1 && SHARD[0] <= SHARD[1])) throw new Error(`PARITY_SHARD must be k/n with 1 ≤ k ≤ n, not ${process.env.PARITY_SHARD}`)
const WASM = process.env.PARITY_WASM ?? join(PACKAGE, '../compiler/npm/meonode_swc_plugin.wasm')
const ON_UI = process.env.PARITY_ON_UI ?? PACKAGE
const ON_OPTIONS = JSON.parse(process.env.PARITY_ON_OPTIONS ?? '{"experimental_extractCss":true}')
const COMPARED = (process.env.PARITY_SIDES ?? 'off,on').split(',')
const LOAD_MAX = Number(process.env.PARITY_LOAD_MAX ?? 10)
const DETAIL = Number(process.env.PARITY_DETAIL ?? 8)
const REPORT = process.env.PARITY_REPORT
/** Every difference found, for PARITY_REPORT. */
const report = []
/** Each case's time in the browser phase, in ms, for PARITY_REPORT. */
const timings = {}
const ENGINE = process.env.PARITY_BROWSER ?? 'chromium'
if (!['chromium', 'webkit', 'firefox'].includes(ENGINE)) throw new Error(`PARITY_BROWSER must be chromium, webkit or firefox, not ${ENGINE}`)
const FORCE_BY_INPUT = ENGINE !== 'chromium' || process.env.PARITY_FORCE === 'input'
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

/** The server-component cases among some case names. */
const metasFromSource = list => list.filter(isRscCase)

await writeGeneratedCases()
const names = PLANT_RUN ? [PLANT_CASE] : caseNames().filter((n, i) => (!ONLY || ONLY.includes(n)) && (!SHARD || i % SHARD[1] === SHARD[0] - 1))
const sides = PLANT_RUN ? ['runtime', 'off'] : ['runtime', ...COMPARED]
console.log(`parity: ${names.length} case(s); sides ${sides.join(', ')}; wasm ${existsSync(WASM) ? WASM : '(missing)'}`)

// 1. Build each side, server-render it in its own process.
const built = {}
for (const s of sides) {
  const { dir, compiled, parts } = await buildSide(SIDES[s], names)
  // Server-component cases first render on the server layer, which SSR then reads.
  const rscNames = metasFromSource(names)
  if (rscNames.length) {
    const payloads = execFileSync(process.execPath, ['--conditions=react-server', join(import.meta.dirname, 'rsc.mjs'), dir, ...rscNames], { env: process.env, maxBuffer: 1 << 28 }).toString()
    writeFileSync(join(dir, 'rsc/payloads.json'), payloads)
  }
  const ssr = JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, 'ssr.mjs'), dir, ...names], { env: process.env, maxBuffer: 1 << 28 }).toString())
  built[s] = { dir, compiled, parts, ssr, client: readFileSync(join(dir, 'client.js'), 'utf8') }
}

// 2. The coverage gate, and on an extracting "on" side the checks that its
//    output extracts what the corpus says: cases tagged with an extracted
//    route carry a marker, cases tagged only with runtime routes carry none,
//    and every routed node is routed as listed.
const metas = []
for (const name of names) metas.push({ name, meta: (await import(pathToFileURL(join(built.runtime.dir, 'corpus', `${name}.mjs`)).href)).meta })
const PARTIAL = PLANT_RUN || ONLY || SHARD
const problems = PARTIAL ? [] : coverageProblems(metas)
// The selector inventory: every webref selector has an entry, and every entry a case.
if (!PARTIAL) {
  for (const name of await selectorGaps()) problems.push(`selector ${name} (webref) has no entry in selectors.mjs`)
  const exercised = new Set(metas.flatMap(({ meta }) => meta.selectors ?? []))
  for (const { name } of SELECTORS) if (!exercised.has(name)) problems.push(`selector ${name} has no case`)
  // The at-rule inventory, the same way.
  for (const name of await atruleGaps()) problems.push(`at-rule ${name} (webref) has no entry in atrules.mjs`)
  const atrulesExercised = new Set(metas.flatMap(({ meta }) => meta.atrules ?? []))
  for (const { id } of ATRULES) if (!atrulesExercised.has(id)) problems.push(`at-rule ${id} has no case`)
}
if (built.on && Object.values(built.on.compiled).some(code => EXTRACTION_MARKERS.some(m => code.includes(m)))) {
  for (const { name, meta } of metas) {
    // The case's module and every part it imports, directly or through another part.
    const seen = new Set()
    const pending = [built.on.compiled[name]]
    while (pending.length) {
      for (const [, part] of pending.pop().matchAll(/\.\/(?:parts\/)?([\w-]+)\.mjs/g)) {
        if (seen.has(part) || !(part in built.on.parts)) continue
        seen.add(part)
        pending.push(built.on.parts[part])
      }
    }
    const code = [built.on.compiled[name], ...[...seen].map(part => built.on.parts[part])].join('\n')
    const marked = EXTRACTION_MARKERS.some(m => code.includes(m))
    const extracted = meta.routes.some(r => EXTRACTED_ROUTES.includes(r))
    // A page generated from an inventory takes whatever routes the compiler gives its shapes; the browser result gates it.
    if (meta.generatedFrom) {
      problems.push(...routingProblems(name, meta.routing, code))
      continue
    }
    if (extracted && !marked) problems.push(`${name}: tagged with an extracted route, but its "on" output has no extraction marker`)
    if (!extracted && marked) problems.push(`${name}: tagged only with runtime routes, but its "on" output has an extraction marker`)
    problems.push(...routingProblems(name, meta.routing, code))
  }
} else if (built.on) {
  console.log('parity: the "on" side carries no extraction markers yet, so it equals "off"; the marker check is off')
}
for (const p of problems) console.log(`COVERAGE ${p}`)
if (NO_BROWSER) {
  console.log(problems.length ? `parity: FAILED (${problems.length})` : 'parity: build, coverage and routing clean')
  process.exit(problems.length ? 1 : 0)
}

// 3. The browser phase, once the machine is quiet enough.
const started = Date.now()
while (loadavg()[0] >= LOAD_MAX) {
  if (Date.now() - started > LOAD_WAIT_MS) throw new Error(`the load average stayed at or above ${LOAD_MAX}`)
  console.log(`parity: load ${loadavg()[0].toFixed(2)}, waiting for under ${LOAD_MAX}`)
  await sleep(30_000)
}
console.log(`parity: browser phase at load ${loadavg()[0].toFixed(2)}`)

/** Headless, so no window takes the user's focus; Chromium is the installed Chrome. */
const browser = await engines[ENGINE].launch({ headless: true, ...(ENGINE === 'chromium' ? { channel: 'chrome' } : {}) })
console.log(`parity: ${ENGINE} ${browser.version()}, forced states through ${FORCE_BY_INPUT ? 'real input' : 'the DevTools protocol'}`)
{
  // The inventory selectors this engine drops; for those, the rule-text comparison is the check.
  const probe = await browser.newPage()
  const supported = await probe.evaluate(keys => keys.map(key => globalThis.CSS.supports(`selector(${key.replaceAll('&', '.parity-x')})`)), SELECTORS.map(s => s.key))
  await probe.close()
  const unsupported = SELECTORS.filter((_, i) => !supported[i]).map(s => s.name)
  console.log(`parity: ${ENGINE} does not support ${unsupported.length} of ${SELECTORS.length} inventory selectors: ${unsupported.join(' ')}`)
  // The same for at-rules, judged by whether the engine keeps each one when it parses a stylesheet.
  const atruleProbe = await browser.newPage()
  const parsed = await atruleProbe.evaluate(parsesAtrules, ATRULES.map(a => [a.name, a.probe]))
  await atruleProbe.close()
  const dropped = ATRULES.filter((_, i) => !parsed[i]).map(a => a.id)
  console.log(`parity: ${ENGINE} does not parse ${dropped.length} of ${ATRULES.length} inventory at-rules: ${dropped.join(' ')}`)
}

/** Serves one case page of one side, in one server-render mode, with an optional plant on its server HTML. */
async function open(side, name, mode, plantHtml) {
  const { head, body } = built[side].ssr[mode][name]
  const { PAGE_CSS } = await import(pathToFileURL(join(built.runtime.dir, 'shell.mjs')).href)
  // A case's own stylesheet, as a site's CSS in the head.
  const own = metas.find(m => m.name === name)?.meta.pageCss
  const pageCss = own ? `<style data-parity-page>${own}</style>` : ''
  const payload = existsSync(join(built[side].dir, 'rsc/payloads.json')) ? JSON.parse(readFileSync(join(built[side].dir, 'rsc/payloads.json'), 'utf8'))[name]?.payload : undefined
  // The payload goes to the page as Next inlines it, for hydration to read; `<` is escaped so it cannot close the script.
  const flight = payload === undefined ? '' : `<script>window.__parityFlight = ${JSON.stringify(payload).replaceAll('<', '\\u003c')}</script>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style>${pageCss}${head}</head><body><div id="root">${plantHtml ? plantHtml(body) : body}</div>${flight}<script src="/${side}/client.js"></script><script>__parity.start(${JSON.stringify(name)}, ${mode === 'registry'})</script></body></html>`
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
  // Each side is served under its own path, so a relative url() resolves there; the record names every side's path alike.
  const own = `${ORIGIN}/${side}/`
  const collected = JSON.parse(JSON.stringify(await collect(host, url, meta, plant?.page ?? null)).replaceAll(own, `${ORIGIN}/<side>/`))
  return { record: collected, html: built[side].ssr[mode][name].body }
}

/**
 * Splits a side's differences into those the case records as expected and the
 * rest, and counts each expectation's matches; one that applies to the side
 * but matches nothing is reported, so a fixed or changed difference shows.
 */
function applyExpected(all, expected = [], side) {
  const applies = expected.filter(e => e.sides.includes(side)).map(e => ({ ...e, matched: 0 }))
  const found = all.filter(d => {
    const e = applies.find(x => x.dimension === d.dimension && d.text.includes(x.text))
    if (e) e.matched++
    return !e
  })
  return { found, expected: applies }
}

let failures = problems.length
/** The pinned ties that differ, each as `tie: case [mode] side`. */
const blockers = new Set()
try {
  if (PLANT_RUN) {
    const meta = metas[0].meta
    const oracle = await record('runtime', PLANT_CASE, 'plain', meta)
    const cleanSide = await record('off', PLANT_CASE, 'plain', meta)
    const clean = [...compareRecords(oracle, cleanSide), ...compareExact(cleanSide.record, (await record('off', PLANT_CASE, 'plain', meta)).record)]
    if (clean.length) {
      failures++
      console.log(`FAIL the unplanted comparison is not clean: ${clean.slice(0, 5).map(d => `${d.dimension} ${d.text}`).join(' | ')}`)
    }
    for (const plant of PLANTS) {
      const side = await record('off', PLANT_CASE, 'plain', meta, plant)
      if (plant.html) side.html = plant.html(side.html)
      // Exact markup compares a compiled side with another, so its plant is checked against the unplanted "off" record.
      const found = [...compareRecords(oracle, side), ...compareExact(cleanSide.record, side.record)]
      const caught = found.some(d => d.dimension === plant.dimension)
      if (!caught) failures++
      console.log(`${caught ? 'caught' : 'MISSED'} plant ${plant.dimension}${plant.name ? ` ${plant.name}` : ''}: ${found.length} difference(s) in ${[...new Set(found.map(d => d.dimension))].join(', ') || 'none'}`)
      // A recorded difference excuses what it matches and nothing else, and one that matches nothing is reported.
      const mine = found.find(d => d.dimension === plant.dimension)
      if (mine) {
        const excused = applyExpected(found, [{ reason: 'planted', sides: ['off'], dimension: mine.dimension, text: mine.text }], 'off')
        const absent = applyExpected([], [{ reason: 'planted', sides: ['off'], dimension: mine.dimension, text: mine.text }], 'off')
        const ok = excused.expected[0].matched > 0 && !excused.found.some(d => d.dimension === mine.dimension && d.text === mine.text) && absent.expected[0].matched === 0
        if (!ok) {
          failures++
          console.log(`FAIL recorded differences do not excuse or report plant ${plant.dimension} as they should`)
        }
      }
    }
    // Compiled plants: the oracle against a rewritten "on" output, beside the unrewritten one.
    for (const plant of COMPILED_PLANTS) {
      const sideBuilt = {}
      for (const [name, rewrite] of [['on', null], ['planted', plant.rewrite]]) {
        const { dir, compiled, parts } = await buildSide({ ...SIDES.on, name, rewrite }, [plant.case])
        const ssr = JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, 'ssr.mjs'), dir, plant.case], { env: process.env, maxBuffer: 1 << 28 }).toString())
        built[name] = sideBuilt[name] = { dir, compiled, parts, ssr, client: readFileSync(join(dir, 'client.js'), 'utf8') }
      }
      if (!built.runtime.ssr.plain[plant.case]) {
        const { dir, compiled } = await buildSide(SIDES.runtime, [plant.case])
        const ssr = JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, 'ssr.mjs'), dir, plant.case], { env: process.env, maxBuffer: 1 << 28 }).toString())
        built.runtime = { dir, compiled, ssr, client: readFileSync(join(dir, 'client.js'), 'utf8') }
      }
      // The rewrite reaches the case module and every part it may import.
      const changed =
        sideBuilt.on.compiled[plant.case] !== sideBuilt.planted.compiled[plant.case] ||
        Object.keys(sideBuilt.on.parts).some(part => sideBuilt.on.parts[part] !== sideBuilt.planted.parts[part])
      const caseMeta = (await import(pathToFileURL(join(built.runtime.dir, 'corpus', `${plant.case}.mjs`)).href)).meta
      const oracle = await record('runtime', plant.case, 'plain', caseMeta)
      const text = d => `${d.dimension} ${d.where} ${d.text}`
      const clean = new Set(compareRecords(oracle, await record('on', plant.case, 'plain', caseMeta)).map(text))
      if (!built.off?.ssr.plain[plant.case]) {
        const { dir, compiled } = await buildSide(SIDES.off, [plant.case])
        const ssr = JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, 'ssr.mjs'), dir, plant.case], { env: process.env, maxBuffer: 1 << 28 }).toString())
        built.off = { dir, compiled, ssr, client: readFileSync(join(dir, 'client.js'), 'utf8') }
      }
      const html = s => built[s].ssr.plain[plant.case].head + built[s].ssr.plain[plant.case].body
      for (const d of compareRuleText(html('off'), html('on'), compile)) clean.add(text(d))
      const found = [...compareRecords(oracle, await record('planted', plant.case, 'plain', caseMeta)), ...compareRuleText(html('off'), html('planted'), compile)].filter(d => !clean.has(text(d)))
      const caught = changed && found.length > 0
      if (!caught) failures++
      console.log(`${caught ? 'caught' : 'MISSED'} compiled plant "${plant.name}": ${changed ? '' : 'the rewrite changed nothing; '}${found.length} new difference(s) in ${[...new Set(found.map(d => d.dimension))].join(', ') || 'none'}`)
    }
    const planted = new Set(PLANTS.map(p => p.dimension))
    for (const d of DIMENSIONS) if (!planted.has(d)) console.log(`note: dimension ${d} has no plant`)
  } else {
    for (const { name, meta } of metas) {
      const started = Date.now()
      for (const mode of meta.serverModes ?? ['plain', 'registry']) {
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
        const records = {}
        for (const side of COMPARED) {
          let all
          try {
            records[side] = await record(side, name, mode, meta)
            all = compareRecords(oracle, records[side])
            // The nodes that must render as with extraction off, compared with the "off" record exactly.
            if (side === 'on' && records.off && records.on.record.exact?.length) all.push(...compareExact(records.off.record, records.on.record))
            // Every selector's rules, "off" against "on", from the server CSS text.
            if (side === 'on' && built.off && meta.render !== 'client') all.push(...compareRuleText(built.off.ssr[mode][name].head + built.off.ssr[mode][name].body, built.on.ssr[mode][name].head + built.on.ssr[mode][name].body, compile))
          } catch (error) {
            all = [{ dimension: 'hydration', where: 'page', text: `the page failed: ${error.message}` }]
          }
          const { found, expected } = applyExpected(all, meta.expected, side)
          for (const e of expected) {
            console.log(`       ${e.blocker ? 'release blocker' : 'expected'} ${e.matched ? `(${e.matched} difference(s))` : 'but ABSENT'}: ${e.reason}`)
            if (e.blocker && e.matched) blockers.add(`${e.blocker}: ${name} [${mode}] ${side}`)
          }
          found.push(...expected.filter(e => !e.matched).map(e => ({ dimension: e.dimension, where: 'expected', text: `a recorded difference did not appear: ${e.reason}` })))
          failures += found.length
          for (const d of found) report.push({ case: name, mode, side, ...d })
          const byDimension = Object.groupBy(found, d => d.dimension)
          const first = Object.values(oracle.record.envs)[0].styles
          const size = `${first.elements.length} elements × ${first.props.length} properties × 4 parts, ${Object.keys(oracle.record.envs).length} environments, ${Object.keys(oracle.record.forced).length} forced states, ${Object.keys(oracle.record.steps).length} steps`
          console.log(`${found.length ? 'FAIL' : 'ok  '} ${name} [${mode}] ${side}: ${found.length ? Object.entries(byDimension).map(([d, l]) => `${d} ${l.length}`).join(', ') : `identical (${size})`}`)
          for (const d of found.slice(0, DETAIL)) console.log(`       ${d.dimension} @ ${d.where}: ${d.text}`)
        }
      }
      timings[name] = Date.now() - started
    }
  }
} finally {
  await browser.close()
}
if (REPORT) writeFileSync(REPORT, JSON.stringify({ engine: ENGINE, wasm: WASM, shard: process.env.PARITY_SHARD ?? null, differences: report, blockers: [...blockers], timings }))
if (blockers.size) console.log(`release blockers (${blockers.size}), pinned and still differing:\n${[...blockers].map(b => `  ${b}`).join('\n')}`)
console.log(failures ? `parity: FAILED (${failures})` : PLANT_RUN ? 'parity: every plant caught' : 'parity: all identical')
process.exitCode = failures ? 1 : 0
