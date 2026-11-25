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
// - PARITY_REPORT: a file to write every difference, each case's time in the browser phase, and the
//   time each phase took per row, to, as JSON
// - PARITY_GRAMMAR: the selector grammar module to generate pages from (default: the compiler's tests/selector-grammar.ts)
// - PARITY_GRAMMAR_CASES: a JSON file of grammar case names, to generate only those
// - PARITY_SHARD: k/n, to run only the k-th of n interleaved slices of the cases, without the
//   coverage gate (which a --no-browser run checks for every case), to split a run across machines
import { AsyncLocalStorage } from 'node:async_hooks'
import { execFile, fork } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { availableParallelism, loadavg } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { promisify } from 'node:util'
import { BUILD_CACHE, buildSide, caseNames, CORPUS, isRscCase, PACKAGE } from './build.mjs'
import { collect, collectFirstPaint, INPUT_STATES, remeasureForced, resweepForced } from './collect.mjs'
import { CACHE_KEYS, compareExact, compareRecords, compareRuleText, DIMENSIONS, FIREFOX_APP_UNIT_PX } from './compare.mjs'
import { writeGeneratedCases } from './generate.mjs'
import { ATRULES, atruleGaps, parsesAtrules } from './atrules.mjs'
import { SELECTORS, selectorGaps } from './selectors.mjs'
import { coverageProblems, EXTRACTED_ROUTES } from './inventory.mjs'
import { COMPILED_PLANTS, MARK_PLANT_CASE, MODE_PLANTS, PLANT_CASE, PLANTS, stripMark } from './plants.mjs'
import { registrationProblems, routingProblems } from './routing.mjs'

if (process.env.NODE_ENV !== 'production') throw new Error('run with NODE_ENV=production: the oracle is the production runtime')
const require = createRequire(join(PACKAGE, 'package.json'))
const engines = require('@playwright/test')
const { compile } = require('stylis')

const args = process.argv.slice(2)
const PLANT_RUN = args.includes('--plants')
/** `--plant=<text>[,<text>…]`: with --plants, only the plants whose name holds one of these; the run then proves nothing whole. */
const PLANT_FILTER = args.find(a => a.startsWith('--plant='))?.slice('--plant='.length)
/** Whether a plant's name or dimension holds the text. */
const plantNamed = (plant, text) => [plant.name, plant.dimension].some(s => s?.includes(text))
const pick = list => (PLANT_FILTER ? list.filter(p => PLANT_FILTER.split(',').some(t => plantNamed(p, t))) : list)
// A filter that names no plant would pass having planted nothing.
for (const text of PLANT_FILTER?.split(',') ?? [])
  if (![...PLANTS, ...MODE_PLANTS, ...COMPILED_PLANTS].some(p => plantNamed(p, text))) throw new Error(`--plant=${text} names no plant`)
/** `--case=<name>[,<name>…]`: only these cases, without the coverage gate. */
const ONLY = args
  .find(a => a.startsWith('--case='))
  ?.slice('--case='.length)
  .split(',')
const NO_BROWSER = args.includes('--no-browser')

/**
 * `--read-forced=<case>@<state key>[;…]`: instead of comparing, read each
 * named forced state on fresh loads of every side, unconditionally, and print
 * how many loads of each side read it differently from that side's most
 * common read (PARITY_READ_LOADS, default 10). The cases must be in `--case`.
 */
const READ_FORCED = args
  .find(a => a.startsWith('--read-forced='))
  ?.slice('--read-forced='.length)
  .split(';')
  .map(spec => spec.split('@'))

/**
 * `--sweep-aa=<n>`: with `--case`, compare nothing; sweep each case's
 * real-input forced states n times on every side, each in a fresh session,
 * and print how many states each side's own sweeps disagree on.
 */
const SWEEP_AA = Number(args.find(a => a.startsWith('--sweep-aa='))?.slice('--sweep-aa='.length) ?? 0)
/** Fresh loads per side for `--read-forced`. */
const READ_LOADS = Number(process.env.PARITY_READ_LOADS ?? 10)
const SHARD = process.env.PARITY_SHARD?.match(/^(\d+)\/(\d+)$/)
  ?.slice(1)
  .map(Number)
if (process.env.PARITY_SHARD && !(SHARD && SHARD[0] >= 1 && SHARD[0] <= SHARD[1]))
  throw new Error(`PARITY_SHARD must be k/n with 1 ≤ k ≤ n, not ${process.env.PARITY_SHARD}`)
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
/** Milliseconds per phase over the whole run, for the log and PARITY_REPORT. */
const phaseTotals = {}
/** Milliseconds per phase for each side's build. */
const buildPhases = {}
/** Milliseconds per phase for each row (case, mode and side), for PARITY_REPORT. */
const rowPhases = []
/** Where the phase times of the row being read go, besides the totals; null outside a row. */
let phaseSink = null

/**
 * The case a worker is reading: its log lines and phase rows, sent to the
 * coordinator with the case, which prints them once every case before it has,
 * so the log reads in case order as a serial run's.
 */
const caseScope = new AsyncLocalStorage()

/**
 * Set in a worker process the coordinator forked: it reads the cases it is
 * handed and sends their lines and records back, and prints nothing itself.
 */
const WORKER = process.env.PARITY_WORKER === '1'
// A worker whose coordinator is gone has no one to report to.
if (WORKER) process.on('disconnect', () => process.exit(1))
const print = console.log
console.log = (...parts) => {
  const scope = caseScope.getStore()
  if (scope) scope.lines.push(parts)
  else if (!WORKER) print(...parts)
}
const runStarted = performance.now()
/** Adds `ms` to a phase's total and to the current row's. */
function spend(phase, ms) {
  phaseTotals[phase] = (phaseTotals[phase] ?? 0) + ms
  const sink = caseScope.getStore()?.sink ?? phaseSink
  if (sink) sink[phase] = (sink[phase] ?? 0) + ms
}
/** Runs `fn`, adding its time to `phase`. */
async function timed(phase, fn) {
  const t = performance.now()
  try {
    return await fn()
  } finally {
    spend(phase, performance.now() - t)
  }
}
/** Starts a row's phase times; the row's record goes to PARITY_REPORT. */
function startRow(row) {
  const sink = {}
  const scope = caseScope.getStore()
  if (scope) {
    scope.sink = sink
    scope.rows.push({ ...row, phases: sink })
  } else {
    phaseSink = sink
    rowPhases.push({ ...row, phases: sink })
  }
}
/** The log line of where the run's time went. */
function phaseLine() {
  const seconds = ms => `${(ms / 1000).toFixed(1)} s`
  return `parity: time by phase on ${ENGINE}: ${Object.entries(phaseTotals)
    .map(([phase, ms]) => `${phase} ${seconds(ms)}`)
    .join(', ')}; wall ${seconds(performance.now() - runStarted)}`
}
const ENGINE = process.env.PARITY_BROWSER ?? 'chromium'
if (!['chromium', 'webkit', 'firefox'].includes(ENGINE)) throw new Error(`PARITY_BROWSER must be chromium, webkit or firefox, not ${ENGINE}`)
const FORCE_BY_INPUT = ENGINE !== 'chromium' || process.env.PARITY_FORCE === 'input'

/**
 * Worker processes the comparison's cases are spread over, each with its own
 * browser and connection, so no one process's thread or connection carries
 * every page. Two fewer than the cores where states are forced through the
 * DevTools protocol. Under real input, hover timing shifts with load: a WebKit
 * A/A at 4 and 8 processes held more disagreements than at 1, but stayed in
 * the recorded hover limit, and every unstable state is still listed: so
 * REAL_INPUT_WORKERS under real input.
 */
const REAL_INPUT_WORKERS = 4
const WORKERS = WORKER
  ? 1
  : Number(process.env.PARITY_WORKERS ?? (FORCE_BY_INPUT ? REAL_INPUT_WORKERS : Math.max(1, availableParallelism() - 2)))
if (!Number.isInteger(WORKERS) || WORKERS < 1) throw new Error(`PARITY_WORKERS must be a whole number from 1, not ${process.env.PARITY_WORKERS}`)
/** How long to wait for the load average to fall before giving up. */
const LOAD_WAIT_MS = 20 * 60_000

/**
 * Extraction markers in compiled output: the class name the compiler gives a
 * node it extracted (`__meo$n`) and the template a node's computed values
 * join (`__meo$t`). A case tagged with an extracted route must carry one on
 * the "on" side.
 */
const EXTRACTION_MARKERS = ['__meo$n', '__meo$t', '__meoFactoryCall(']

/** The case the marker check's own plants rewrite: one whose nodes the compiler names. */
const MARKER_PLANT_CASE = 'overlap'
/** The case the joined-call plant rewrites: one whose nodes are calls of imported factories. */
const JOINED_PLANT_CASE = 'joined'

/** Puts a carrier mark on the node keyed `key`, before its `__meo$k`. */
const addMark = key => code => code.replace(new RegExp(`\\n(\\s*)(__meo\\$k: [^\\n]*\\n\\s*key: '${key}',)`), '\n$1__meo$$r: 1,\n$1$2')

/**
 * The marker check's plants, each a rewrite of one case's "on" output that
 * the check must fail and the unrewritten output must pass: the output of a
 * build with extraction off, the names taken off the nodes, the names kept
 * with their registered rules emptied, the carrier marks taken off or put on
 * every named node, the mark taken off a plain, a themed and a merged carrier or
 * put on a themed and a merged node that is none, and the joined calls turned back
 * into plain calls of the factory.
 */
const MARKER_PLANTS = [
  // What a compiler that extracted nothing would emit: the case as the "off" side compiles it.
  { name: 'the "on" output built with extraction off', case: MARKER_PLANT_CASE, off: true },
  { name: 'the class names stripped from the nodes', case: MARKER_PLANT_CASE, rewrite: code => code.replace(/^\s*__meo\$n: [^\n]*,?\n/gm, '') },
  { name: 'the names kept, their rules emptied', case: MARKER_PLANT_CASE, rewrite: code => code.replace(/(__meoCss\("[^"]+",\s*)\[[\s\S]*?\n\]\)/g, '$1[])') },
  { name: 'the carrier marks stripped from the nodes', case: MARK_PLANT_CASE, rewrite: code => code.replace(/^\s*__meo\$r: [^\n]*,?\n/gm, '') },
  {
    name: 'a carrier mark on every named node',
    case: MARKER_PLANT_CASE,
    rewrite: code => code.replace(/^(\s*)(__meo\$n: [^\n]*,)\n(?!\s*__meo\$r)/gm, '$1$2\n$1__meo$$r: 1,\n'),
  },
  { name: 'the carrier mark stripped from a plain carrier', case: MARK_PLANT_CASE, node: 'marked-plain', rewrite: stripMark('marked-plain') },
  // A themed and a merged carrier keep their own route, so their mark is checked through the claim's carrier flag.
  { name: 'the carrier mark stripped from a themed carrier', case: MARK_PLANT_CASE, node: 'marked-themed', rewrite: stripMark('marked-themed') },
  { name: 'the carrier mark stripped from a merged carrier', case: MARK_PLANT_CASE, node: 'marked-merged', rewrite: stripMark('marked-merged') },
  { name: 'a carrier mark on a themed node', case: 'at-rule-blocks', node: 'hide', rewrite: addMark('hide') },
  { name: 'a carrier mark on a merged node', case: 'layout-factories', node: 'row', rewrite: addMark('row') },
  { name: 'the joined calls made plain calls', case: JOINED_PLANT_CASE, rewrite: code => code.replace(/__meoFactoryCall\((\w+), __meoSite\w*, /g, '$1(') },
]
const ORIGIN = 'http://parity.localhost'

const SIDES = {
  runtime: { name: 'runtime', ui: PACKAGE, plugin: null },
  off: { name: 'off', ui: PACKAGE, plugin: [WASM, { experimental_extractCss: false }] },
  on: { name: 'on', ui: ON_UI, plugin: [WASM, ON_OPTIONS] },
}

/** The server-component cases among some case names. */
const metasFromSource = list => list.filter(isRscCase)

// Workers read the cases their coordinator wrote; writing them again would race the other workers.
if (!WORKER) await writeGeneratedCases()
const names = PLANT_RUN ? [PLANT_CASE] : caseNames().filter((n, i) => (!ONLY || ONLY.includes(n)) && (!SHARD || i % SHARD[1] === SHARD[0] - 1))
const sides = PLANT_RUN ? ['runtime', 'off'] : ['runtime', ...COMPARED]
/** The compiler wasm's SHA-256, so every log and report names the exact compiler it ran. */
const WASM_SHA256 = existsSync(WASM) ? createHash('sha256').update(readFileSync(WASM)).digest('hex') : null
console.log(`parity: ${names.length} case(s); sides ${sides.join(', ')}; wasm ${existsSync(WASM) ? `${WASM} (sha256 ${WASM_SHA256})` : '(missing)'}`)

/** Server-render processes run at once: each is mostly start-up and one render. */
const RENDER_PROCESSES = availableParallelism()
const execFileAsync = promisify(execFile)

/** Runs `fn` over `items`, at most `size` at once. */
async function pool(items, size, fn) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
}

/** One script's JSON output, run in a process of its own. */
async function runScript(args) {
  const { stdout } = await execFileAsync(process.execPath, args, { env: process.env, maxBuffer: 1 << 28 })
  return JSON.parse(stdout)
}

/**
 * Server-renders `names` of a built side, each case and mode in a process of
 * its own (ssr.mjs), as a fresh server's first request: module state, such
 * as the names an Emotion cache has inserted, never carries from one render
 * to another. Server-component cases first render on the server layer, one
 * process per case (rsc.mjs), and SSR reads their payloads.
 * @returns `{ plain: { <case>: { head, body } | { error } }, registry: { … } }`
 */
async function serverRender(dir, names) {
  const rscNames = metasFromSource(names)
  if (rscNames.length) {
    const payloads = {}
    await timed('rsc', () =>
      pool(rscNames, RENDER_PROCESSES, async name => {
        payloads[name] = await runScript(['--conditions=react-server', join(import.meta.dirname, 'rsc.mjs'), dir, name])
      }),
    )
    writeFileSync(join(dir, 'rsc/payloads.json'), JSON.stringify(payloads))
  }
  const out = { plain: {}, registry: {} }
  const renders = names.flatMap(name => ['plain', 'registry'].map(mode => ({ name, mode })))
  await timed('ssr', () =>
    pool(renders, RENDER_PROCESSES, async ({ name, mode }) => {
      out[mode][name] = await runScript([join(import.meta.dirname, 'ssr.mjs'), dir, mode, name])
    }),
  )
  return out
}

// 1. Build each side and server-render it.
const built = {}
if (WORKER)
  for (const [s, side] of Object.entries(JSON.parse(readFileSync(process.env.PARITY_BUILT, 'utf8'))))
    built[s] = { ...side, client: readFileSync(join(side.dir, 'client.js'), 'utf8') }
else for (const s of sides) {
  phaseSink = buildPhases[s] = {}
  const { dir, compiled, parts } = await timed('build', () => buildSide(SIDES[s], names))
  const ssr = await serverRender(dir, names)
  built[s] = { dir, compiled, parts, ssr, client: readFileSync(join(dir, 'client.js'), 'utf8') }
}
phaseSink = null
const checksStarted = performance.now()

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
// Every Emotion cache key the corpus creates is one the rule-text comparison names classes by.
for (const file of readdirSync(CORPUS, { recursive: true }).filter(f => f.endsWith('.ts'))) {
  for (const [, key] of readFileSync(join(CORPUS, file), 'utf8').matchAll(/createCache\(\{\s*key:\s*'([^']+)'/g)) {
    if (!CACHE_KEYS.includes(key)) problems.push(`${file}: cache key '${key}' is not in compare.mjs CACHE_KEYS`)
  }
}

/**
 * The rule-text model's own fixtures: server HTML as a browser parses it, each
 * style element a sheet of its own, with the differences the comparison must
 * report. An open statement ending one element must not swallow the next
 * element's rule, and a statement after a rule sets nothing in either form.
 */
const RULE_TEXT_FIXTURES = [
  {
    name: 'an open @import ending one style element, a rule in the next',
    off: '<style>.css-a{color:red}@import url("a.css")</style><style>.css-b .x{padding:4px}</style>',
    on: '<style>.css-a{color:red}@import url("a.css");.css-b .x{padding:4px}</style>',
    differences: 0,
  },
  { name: 'a declaration that differs', off: '<style>.css-b .x{padding:4px}</style>', on: '<style>.css-b .x{padding:5px}</style>', differences: 2 },
]
for (const f of RULE_TEXT_FIXTURES) {
  const found = compareRuleText(f.off, f.on, compile)
  if (found.length !== f.differences)
    problems.push(`rule-text model: ${f.name}: ${found.length} difference(s), not ${f.differences}: ${found.map(d => d.text).join('; ')}`)
}

/** A case's module on a side and every part it imports, directly or through another part, as one text. */
function sideCode(side, name) {
  const seen = new Set()
  const pending = [built[side].compiled[name]]
  while (pending.length) {
    for (const [, part] of pending.pop().matchAll(/\.\/(?:parts\/)?([\w-]+)\.mjs/g)) {
      if (seen.has(part) || !(part in built[side].parts)) continue
      seen.add(part)
      pending.push(built[side].parts[part])
    }
  }
  return [built[side].compiled[name], ...[...seen].map(part => built[side].parts[part])].join('\n')
}
const onCode = name => sideCode('on', name)

/** The marker, registration and routing problems of one case's "on" output. */
function markerProblems(name, meta, code) {
  const out = [...registrationProblems(name, code), ...routingProblems(name, meta.routing, code)]
  // A page generated from an inventory takes whatever routes the compiler gives its shapes; the browser result gates it.
  if (meta.generatedFrom) return out
  const marked = EXTRACTION_MARKERS.some(m => code.includes(m))
  const extracted = meta.routes.some(r => EXTRACTED_ROUTES.includes(r))
  if (extracted && !marked) out.push(`${name}: tagged with an extracted route, but its "on" output has no extraction marker`)
  if (!extracted && marked) out.push(`${name}: tagged only with runtime routes, but its "on" output has an extraction marker`)
  return out
}

// A case's markers may sit in a part it imports, so each case is read with its parts.
if (built.on && metas.some(({ name }) => EXTRACTION_MARKERS.some(m => onCode(name).includes(m)))) {
  for (const { name, meta } of metas) problems.push(...markerProblems(name, meta, onCode(name)))
  // The check's own plants: each must fail the planted output, which the clean one passes.
  for (const plant of MARKER_PLANTS) {
    const plantMeta = metas.find(m => m.name === plant.case)?.meta
    // A shard or a chosen list of cases may leave a plant's case out; the full run must hold it.
    if (!plantMeta) {
      if (!PARTIAL) problems.push(`marker plant "${plant.name}": its case ${plant.case} is not in this run`)
      continue
    }
    const code = onCode(plant.case)
    const clean = markerProblems(plant.case, plantMeta, code)
    const planted = plant.off ? sideCode('off', plant.case) : plant.rewrite(code)
    const found = planted === code ? [] : markerProblems(plant.case, plantMeta, planted)
    // A plant on one node is caught only by a problem naming that node.
    const caught = planted !== code && clean.length === 0 && (plant.node ? found.some(f => f.includes(` node ${plant.node} (`)) : found.length > 0)
    if (!caught)
      problems.push(
        `marker plant "${plant.name}" on ${plant.case}: ${planted === code ? 'the rewrite changed nothing' : `${found.length} problem(s) planted, ${clean.length} clean`}`,
      )
    console.log(
      `${caught ? 'caught' : 'MISSED'} marker plant "${plant.name}" on ${plant.case}: ${found.length} problem(s) planted, ${clean.length} clean${found.length ? `; first: ${found[0]}` : ''}`,
    )
  }
} else if (built.on) {
  // An "on" build that extracted nothing renders as "off" does, so the browser phase alone cannot tell.
  problems.push('the "on" side carries no extraction marker in any case: it extracted nothing')
}
for (const p of problems) console.log(`COVERAGE ${p}`)
spend('checks', performance.now() - checksStarted)
if (NO_BROWSER) {
  console.log(phaseLine())
  console.log(problems.length ? `parity: FAILED (${problems.length})` : 'parity: build, coverage and routing clean')
  process.exit(problems.length ? 1 : 0)
}

// 3. The browser phase, once the machine is quiet enough.
const started = Date.now()
const loadWaitStarted = performance.now()
while (!WORKER && loadavg()[0] >= LOAD_MAX) {
  if (Date.now() - started > LOAD_WAIT_MS) throw new Error(`the load average stayed at or above ${LOAD_MAX}`)
  console.log(`parity: load ${loadavg()[0].toFixed(2)}, waiting for under ${LOAD_MAX}`)
  await sleep(30_000)
}
spend('load wait', performance.now() - loadWaitStarted)
console.log(`parity: browser phase at load ${loadavg()[0].toFixed(2)}`)

/** Headless, so no window takes the user's focus; Chromium is the installed Chrome. */
const browser = await engines[ENGINE].launch({ headless: true, ...(ENGINE === 'chromium' ? { channel: 'chrome' } : {}) })
console.log(`parity: ${ENGINE} ${browser.version()}, forced states through ${FORCE_BY_INPUT ? 'real input' : 'the DevTools protocol'}`)
{
  // The inventory selectors this engine drops; for those, the rule-text comparison is the check.
  const probe = await browser.newPage()
  const supported = await probe.evaluate(
    keys => keys.map(key => globalThis.CSS.supports(`selector(${key.replaceAll('&', '.parity-x')})`)),
    SELECTORS.map(s => s.key),
  )
  await probe.close()
  const unsupported = SELECTORS.filter((_, i) => !supported[i]).map(s => s.name)
  console.log(`parity: ${ENGINE} does not support ${unsupported.length} of ${SELECTORS.length} inventory selectors: ${unsupported.join(' ')}`)
  // The same for at-rules, judged by whether the engine keeps each one when it parses a stylesheet.
  const atruleProbe = await browser.newPage()
  const parsed = await atruleProbe.evaluate(
    parsesAtrules,
    ATRULES.map(a => [a.name, a.probe]),
  )
  await atruleProbe.close()
  const dropped = ATRULES.filter((_, i) => !parsed[i]).map(a => a.id)
  console.log(`parity: ${ENGINE} does not parse ${dropped.length} of ${ATRULES.length} inventory at-rules: ${dropped.join(' ')}`)
}

/** Serves one case page of one side, in one server-render mode, with an optional plant on its server HTML. */
async function open(side, name, mode, plantHtml, plantHead) {
  const { head, body } = built[side].ssr[mode][name]
  const { PAGE_CSS } = await import(pathToFileURL(join(built.runtime.dir, 'shell.mjs')).href)
  // A case's own stylesheet, as a site's CSS in the head.
  const own = metas.find(m => m.name === name)?.meta.pageCss
  const pageCss = own ? `<style data-parity-page>${own}</style>` : ''
  const payload = existsSync(join(built[side].dir, 'rsc/payloads.json'))
    ? JSON.parse(readFileSync(join(built[side].dir, 'rsc/payloads.json'), 'utf8'))[name]?.payload
    : undefined
  // The payload goes to the page as Next inlines it, for hydration to read; `<` is escaped so it cannot close the script.
  const flight = payload === undefined ? '' : `<script>window.__parityFlight = ${JSON.stringify(payload).replaceAll('<', '\\u003c')}</script>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style>${pageCss}${plantHead ? plantHead(head) : head}</head><body><div id="root">${plantHtml ? plantHtml(body) : body}</div>${flight}<script src="/${side}/client.js"></script><script>__parity.start(${JSON.stringify(name)}, ${mode === 'registry'})</script></body></html>`
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
  const { html, url } = await open(side, name, mode, plant?.html, plant?.head)
  context.pages.set(new URL(url).pathname, html)
  // Each side is served under its own path, so a relative url() resolves there; the record names every side's path alike.
  const own = `${ORIGIN}/${side}/`
  const raw = await collect(host, url, meta, plant?.page ?? null, spend)
  if (meta.firstPaint && meta.render !== 'client') raw.firstPaint = await timed('first paint', () => collectFirstPaint(host, url, meta, plant?.firstPaint ?? null))
  const collected = JSON.parse(JSON.stringify(raw).replaceAll(own, `${ORIGIN}/<side>/`))
  return { record: collected, html: built[side].ssr[mode][name].body }
}

/**
 * Whether forced-state differences are exactly one per named state, all on one
 * element and each holding the text: no state missing, repeated or extra. A
 * difference's `where` reads `element <index><state>`, as `element 5:hover`.
 */
function isExactly(differences, text, states) {
  const places = differences.map(d => /^element (\d+)(:.+)$/.exec(d.where))
  if (places.some(p => !p) || new Set(places.map(p => p[1])).size !== 1) return false
  const found = places.map(p => p[2]).sort()
  const wanted = [...states].sort()
  return found.length === wanted.length && found.every((state, i) => state === wanted[i]) && differences.every(d => d.text.includes(text))
}

/**
 * Splits a side's differences into those the case records as expected and the
 * rest, and counts each expectation's matches; one that applies to the side
 * but matches nothing is reported, so a fixed or changed difference shows. An
 * expectation that names engines applies on those alone: elsewhere it neither
 * excuses a difference nor has to appear.
 */
function applyExpected(all, expected = [], side, mode, engine = ENGINE) {
  const applies = expected
    .filter(e => e.sides.includes(side) && (!e.modes || !mode || e.modes.includes(mode)) && (!e.engines || e.engines.includes(engine)))
    .map(e => ({ ...e, matched: 0 }))
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
/** Each row's forced states left out as unstable under real input, for the summary and PARITY_REPORT. */
const unstable = []
/** Each row's differences left out as layout snapping (compare.mjs, FIREFOX_APP_UNIT_PX), for the summary and PARITY_REPORT. */
const snapped = []

/**
 * Each row's confirmed forced states that only the compared page read
 * differently on some fresh load, with the 1-minute load average and the time
 * they were seen, for PARITY_REPORT: they stay failures, and the load tells a
 * busy machine's flake from a race the compiled side brings.
 */
const onlyCompared = []

/**
 * Fresh loads when a forced-state difference under real input is confirmed:
 * more for the pages that can excuse a state (the oracle and the "off" side),
 * so a flake that hits one load in several is seen there, and fewer for the
 * compared page, whose variance alone never excuses.
 */
const EXCUSING_LOADS = 4
const COMPARED_LOADS = 4

/**
 * Sweeps per page, each in a fresh session along the same pointer path, that
 * decide a forced-state difference under real input: a state can differ only
 * after the pointer has crossed earlier elements, which a fresh-load read of
 * the state alone never shows.
 */
const RESWEEPS = 3
/** Extra sweeps of a page when a state's element did not hold the state on some read, so each state gets RESWEEPS valid samples. */
const RESWEEP_RETRIES = 3

/**
 * A page to load again: its side, case, mode and meta, the plant applied to
 * it, and a label naming it among the pages of one case and mode, so the "off"
 * and "on" rows share the oracle's and the "off" side's reloads.
 * @typedef {{ label: string, side: string, name: string, mode: string, meta: object, plant?: object }} PageSpec
 */

/**
 * The forced states `keys` read on at least `loads` fresh loads of a page,
 * kept in `cache` by the page's label, so a page read for one row is only
 * topped up for the next.
 * @returns A map from each key to its reads, one per load.
 */
async function forcedOnReload(spec, keys, loads, cache) {
  let memo = cache.get(spec.label)
  if (!memo) cache.set(spec.label, (memo = new Map()))
  for (const k of keys) if (!memo.has(k)) memo.set(k, [])
  for (;;) {
    const short = keys.filter(k => memo.get(k).length < loads)
    if (!short.length) return memo
    const { html, url } = await open(spec.side, spec.name, spec.mode, spec.plant?.html, spec.plant?.head)
    context.pages.set(new URL(url).pathname, html)
    const own = `${ORIGIN}/${spec.side}/`
    const read = JSON.parse(
      JSON.stringify(await timed('confirm reloads', () => remeasureForced(host, url, spec.meta, spec.plant?.page ?? null, short))).replaceAll(own, `${ORIGIN}/<side>/`),
    )
    for (const k of short) memo.get(k).push(read[k])
  }
}

/**
 * RESWEEPS sweeps of a page up to the highest element `keys` name, kept in
 * `cache` by the page's label, so a page swept for one row is swept again for
 * the next only when it needs elements further on.
 * @returns The sweeps, each a map from a key to its read.
 */
async function forcedOnResweep(spec, keys, cache) {
  const upTo = Math.max(...keys.map(k => Number(k.split(':')[0])))
  let memo = cache.get(`sweeps ${spec.label}`)
  if (!memo || memo.upTo < upTo) cache.set(`sweeps ${spec.label}`, (memo = { upTo, sweeps: [] }))
  const valid = k => memo.sweeps.filter(sweep => sweep.samples[k]?.held !== false).length
  while (memo.sweeps.length < RESWEEPS || (keys.some(k => valid(k) < RESWEEPS) && memo.sweeps.length < RESWEEPS + RESWEEP_RETRIES)) {
    const { html, url } = await open(spec.side, spec.name, spec.mode, spec.plant?.html, spec.plant?.head)
    context.pages.set(new URL(url).pathname, html)
    const own = `${ORIGIN}/${spec.side}/`
    memo.sweeps.push(
      JSON.parse(
        JSON.stringify(await timed('confirm sweeps', () => resweepForced(host, url, spec.meta, spec.plant?.page ?? null, memo.upTo))).replaceAll(own, `${ORIGIN}/<side>/`),
      ),
    )
  }
  return memo.sweeps
}

/** The side name of the registry check's rows. */
const MODES_SIDE = 'runtime-modes'

/**
 * The registry check: the runtime's [registry] record against its own [plain]
 * one, which is Emotion's per-node server render. A registry changes only
 * where server styles are written, never what they do, so any difference is a
 * registry defect, which a [registry] row cannot see when both its sides share
 * it. Forced states under real input are confirmed as in any row, with
 * [plain] as the oracle.
 * @param plant A plant for the [registry] page, as `record` takes it; or undefined.
 * @returns What `confirmForced` returns.
 */
async function compareModes(name, meta, plain, registry, plant) {
  const all = compareRecords({ record: plain.record, html: '' }, { record: registry.record, html: '' })
  const spec = (mode, label) => ({ label, side: 'runtime', name, mode, meta, plant: mode === 'registry' ? plant : undefined })
  const oracle = { spec: spec('plain', 'runtime plain'), record: plain.record }
  const confirmation = await confirmForced(all, { oracle, off: oracle, compared: { spec: spec('registry', `runtime registry${plant ? ' planted' : ''}`), record: registry.record } }, new Map())
  return { ...confirmation, snapped: all.snapped }
}

/**
 * Ends a row: applies the case's expected differences, counts and reports
 * what is left, and logs the row's verdict.
 * @param oracle The oracle's record, for the size line.
 * @param left The forced states left out as unstable.
 * @param snaps The differences left out as layout snapping.
 */
function finishRow(name, mode, side, meta, all, oracle, left, snaps = []) {
  const { found, expected } = applyExpected(all, meta.expected, side, mode)
  for (const e of expected) {
    console.log(`       ${e.blocker ? 'release blocker' : 'expected'} ${e.matched ? `(${e.matched} difference(s))` : 'but ABSENT'}: ${e.reason}`)
    if (e.blocker && e.matched) blockers.add(`${e.blocker}: ${name} [${mode}] ${side}`)
  }
  found.push(
    ...expected.filter(e => !e.matched).map(e => ({ dimension: e.dimension, where: 'expected', text: `a recorded difference did not appear: ${e.reason}` })),
  )
  failures += found.length
  for (const d of found) report.push({ case: name, mode, side, ...d })
  const byDimension = Object.groupBy(found, d => d.dimension)
  const first = Object.values(oracle.record.envs)[0].styles
  const size = `${first.elements.length} elements × ${first.props.length} properties × 4 parts, ${Object.keys(oracle.record.envs).length} environments, ${Object.keys(oracle.record.forced).length} forced states, ${Object.keys(oracle.record.steps).length} steps`
  console.log(
    `${found.length ? 'FAIL' : 'ok  '} ${name} [${mode}] ${side}: ${
      found.length
        ? Object.entries(byDimension)
            .map(([d, l]) => `${d} ${l.length}`)
            .join(', ')
        : `identical (${size})`
    }`,
  )
  for (const d of found.slice(0, DETAIL)) console.log(`       ${d.dimension} @ ${d.where}: ${d.text}`)
  noteUnstable({ case: name, mode, side }, left)
  noteSnapped({ case: name, mode, side }, snaps)
}

/** The forced-state key a difference names (`<element index>:<state>[+<state>…]`). */
const forcedKey = d => d.where.replace(/^element /, '')
/** Whether a difference is a forced state that real input applies. */
const isInputForced = d => d.dimension === 'forced-state' && (forcedKey(d).split(':')[1] ?? '').split('+').every(s => INPUT_STATES.includes(s))

/**
 * Confirms a row's forced-state differences, on engines that force states
 * through real input. Real input does not take effect the same way in every
 * session, so each differing state is decided by RESWEEPS whole sweeps of
 * every page (the oracle, the "off" side and the compared page), each in a
 * fresh session along the same pointer path. A state is decided in units: an
 * element only the state has or loses on some read is a unit of its own,
 * named `<state> <element key>` (`+<path>`, or the index of an element now
 * absent), and the rest of the state is its shared unit, named by the state.
 * Each read is cut down to a unit's entries, from all it holds, not only the
 * first record's differences. A unit is
 * - excused as unstable when the oracle's or the "off" side's sweeps disagree
 *   among themselves: that is the engine, since neither has extraction; or
 *   when only the compared page's sweeps disagree and every one of its fresh
 *   loads reads what the oracle's most common fresh load reads: the first
 *   record was a load outlier;
 * - excused as an outlier when every sweep of the compared page reads what
 *   the oracle's most common sweep reads: the first sweep's difference does
 *   not reproduce;
 * - confirmed otherwise: the compared page's sweeps reproduce it every time,
 *   or only sometimes and some of its fresh loads too (which may be
 *   extraction introducing a race), while the oracle and "off" are steady.
 * A shared unit left out takes its state's own units with it; an own unit
 * left out takes only its element's differences.
 * Fresh loads that read each state alone (EXCUSING_LOADS of the oracle and
 * "off", COMPARED_LOADS of the compared page) are kept as evidence: a
 * difference that shows only after the pointer has crossed earlier elements
 * reproduces in the sweeps and on no fresh load.
 * @param found The row's differences.
 * @param pages `{ oracle, off, compared }`, each `{ spec: PageSpec, record }`; "off" may be the compared page itself.
 * @returns The differences left, the units excused as unstable or as outliers, the units confirmed and those of them the compared page's sweeps disagree on, and the per-page counts, each by unit.
 */
async function confirmForced(found, pages, cache) {
  const keys = [...new Set(found.filter(isInputForced).map(forcedKey))]
  if (!FORCE_BY_INPUT || !keys.length || !pages.off)
    return { found, unstable: [], outliers: [], confirmed: [], onlyCompared: [], notHeld: [], varied: {}, swept: {}, reloadReproduced: {} }
  const roles = ['oracle', 'off', 'compared']
  // The most common value; none of an empty list, as a unit no sweep of the oracle held has.
  const modal = list => (list.length ? Object.entries(Object.groupBy(list, v => v)).sort((a, b) => b[1].length - a[1].length)[0][0] : undefined)
  // Evidence: fresh loads, each reading the state alone.
  const reads = {}
  for (const role of roles) reads[role] = await forcedOnReload(pages[role].spec, keys, role === 'compared' ? COMPARED_LOADS : EXCUSING_LOADS, cache)
  // The decision: whole sweeps in fresh sessions, along the same pointer path.
  const sweeps = {}
  for (const role of roles) sweeps[role] = await forcedOnResweep(pages[role].spec, keys, cache)
  // A state's reads fall into units, each decided on its own: an element only a forced state has (`+<path>`) or loses
  // (an index with an `(element)` entry), in any read of any page, is a unit named `<state> <element key>`; every
  // other entry is in the state's shared unit, named by the state. So DOM that comes and goes is left out alone, and
  // the elements both pages hold steadily stay compared.
  const readsOf = k => roles.flatMap(role => [pages[role].record.forced[k], ...reads[role].get(k), ...sweeps[role].map(sweep => sweep.forced[k])])
  const own = new Map(
    keys.map(k => {
      const elements = new Set()
      for (const read of readsOf(k))
        for (const entry of Object.keys(read ?? {})) {
          const [element, , prop] = entry.split('/')
          if (element.startsWith('+') || prop === '(element)') elements.add(element)
        }
      return [k, elements]
    }),
  )
  const unitOf = (k, entry) => {
    const element = entry.split('/')[0]
    return own.get(k).has(element) ? `${k} ${element}` : k
  }
  const stateOf = unit => unit.split(' ')[0]
  // A read as its unit sees it: the unit's entries, from every entry the read holds.
  const text = (read, unit) => {
    const kept = Object.entries(read ?? {}).filter(([entry]) => unitOf(stateOf(unit), entry) === unit)
    return JSON.stringify(Object.fromEntries(kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))))
  }
  const units = [...new Set(found.filter(isInputForced).map(d => unitOf(forcedKey(d), d.entry)))]
  const differs = (role, u) => reads[role].get(stateOf(u)).filter(v => text(v, u) !== text(pages[role].record.forced[stateOf(u)], u)).length
  const varied = Object.fromEntries(units.map(u => [u, Object.fromEntries(roles.map(role => [role, [differs(role, u), reads[role].get(stateOf(u)).length]]))]))
  const reloadReproduced = Object.fromEntries(
    units.map(u => {
      const oracle = modal(reads.oracle.get(stateOf(u)).map(v => text(v, u)))
      return [u, [reads.compared.get(stateOf(u)).filter(v => text(v, u) !== oracle).length, reads.compared.get(stateOf(u)).length]]
    }),
  )
  // Only valid samples count: reads whose element held the state, the first RESWEEPS of them.
  const at = (role, u) =>
    sweeps[role]
      .filter(sweep => sweep.samples[stateOf(u)]?.held !== false)
      .slice(0, RESWEEPS)
      .map(sweep => text(sweep.forced[stateOf(u)], u))
  // A state no sweep of some page could hold has no samples to judge by.
  const notHeld = units.filter(u => roles.some(role => at(role, u).length === 0))
  const steady = (role, u) => new Set(at(role, u)).size === 1
  const oracleRead = u => modal(at('oracle', u))
  // How many of each page's sweeps read a unit differently from the oracle's most common sweep read.
  const swept = Object.fromEntries(
    units.map(u => [u, Object.fromEntries(roles.map(role => [role, [at(role, u).filter(v => v !== oracleRead(u)).length, RESWEEPS]]))]),
  )
  // The engine: the oracle or "off" (no extraction on either) disagrees with itself across sweeps.
  // Or only the compared page disagrees with itself, and every one of its fresh loads reads what the oracle's do.
  const loadOutlier = u => !steady('compared', u) && reloadReproduced[u][0] === 0
  const unstable = units.filter(u => notHeld.includes(u) || !steady('oracle', u) || !steady('off', u) || loadOutlier(u))
  // An outlier: every sweep of the compared page reads what the oracle's do.
  const outliers = units.filter(u => !unstable.includes(u) && at('compared', u).every(v => v === oracleRead(u)))
  const confirmed = units.filter(u => !unstable.includes(u) && !outliers.includes(u))
  // A state whose shared unit is left out goes whole: its own elements are no sample once the rest of it is not.
  const leftOut = u => unstable.includes(u) || outliers.includes(u) || unstable.includes(stateOf(u)) || outliers.includes(stateOf(u))
  return {
    found: found.filter(d => !(isInputForced(d) && leftOut(unitOf(forcedKey(d), d.entry)))),
    unstable,
    outliers,
    confirmed: confirmed.filter(u => !leftOut(u)),
    onlyCompared: confirmed.filter(u => !leftOut(u) && !steady('compared', u)),
    notHeld,
    varied,
    swept,
    reloadReproduced,
  }
}

/**
 * Each row's forced states read again on fresh loads, with how many loads of
 * each page read a state differently from that page's first record, for
 * PARITY_REPORT: the variation rate per page that tells the engine from the
 * compiled side.
 */
const reloadCounts = []

/** Prints and keeps a row's per-page reload variation. */
function noteReloads(row, varied) {
  const keys = Object.keys(varied)
  if (!keys.length) return
  const page = role => (role === 'compared' ? row.side : role)
  console.log(
    `       fresh loads that varied: ${keys
      .map(
        k =>
          `${k} ${Object.entries(varied[k])
            .map(([role, [n, of]]) => `${page(role)} ${n}/${of}`)
            .join(', ')}`,
      )
      .join('; ')}`,
  )
  reloadCounts.push({ ...row, varied })
}

/** Prints and keeps the confirmed states only the compared page varied on, with the load and time. */
function noteOnlyCompared(row, states) {
  if (!states.length) return
  const seen = { load1: Number(loadavg()[0].toFixed(2)), time: new Date().toISOString() }
  console.log(`       forced states only the compared page varied on (${states.length}), load ${seen.load1} at ${seen.time}: ${states.join(', ')}`)
  onlyCompared.push({ ...row, states, ...seen })
}

/** Each row's sweep outliers: states its first sweep read differently and its repeated sweeps did not, kept for PARITY_REPORT. */
const outliers = []
/** The pages reloaded once during their forced-state sweep for a stray :hover (collect.mjs, withReload), for PARITY_REPORT. */
const reloaded = []
/** The run's records gathered per case, which a worker sends back with each case it reads. */
const GATHERED = { report, unstable, snapped, onlyCompared, outliers, reloadCounts, reloaded }

/** Prints and keeps the stray :hover a page's sweep was reloaded for, with the load and time. */
function noteReload(row, recorded) {
  const stray = recorded.record.reloadedFor
  if (!stray) return
  const seen = { load1: Number(loadavg()[0].toFixed(2)), time: new Date().toISOString() }
  console.log(`       ${row.side} page reloaded once, load ${seen.load1} at ${seen.time}, for ${stray}`)
  reloaded.push({ ...row, stray, ...seen })
}

/** Prints and keeps a row's sweep outliers, with the load, the time and every page's sweep counts. */
function noteOutliers(row, states, swept) {
  if (!states.length) return
  const seen = { load1: Number(loadavg()[0].toFixed(2)), time: new Date().toISOString() }
  const page = role => (role === 'compared' ? row.side : role)
  const counts = states
    .map(
      k =>
        `${k} ${Object.entries(swept[k])
          .map(([role, [n, of]]) => `${page(role)} ${n}/${of}`)
          .join(', ')}`,
    )
    .join('; ')
  console.log(`       sweep outliers left out (${states.length}), not reproduced in ${RESWEEPS} sweeps, load ${seen.load1} at ${seen.time}: ${counts}`)
  outliers.push({ ...row, states, swept: Object.fromEntries(states.map(k => [k, swept[k]])), ...seen })
}

/** Prints and keeps the differences a row left out as layout snapping. */
function noteSnapped(row, differences) {
  if (!differences.length) return
  console.log(`       layout snapping left out (${differences.length}), within ${FIREFOX_APP_UNIT_PX.toFixed(4)}px plus the snaps inside each box:`)
  for (const d of differences.slice(0, DETAIL)) console.log(`         ${d.dimension} @ ${d.where}: ${d.text}`)
  snapped.push({ ...row, differences })
}

/** Prints and keeps the states a row left out as unstable. */
function noteUnstable(row, states) {
  if (!states.length) return
  console.log(`       unstable forced states left out (${states.length}): ${states.join(', ')}`)
  unstable.push({ ...row, states })
}
try {
  if (SWEEP_AA) {
    for (const { name, meta } of metas) {
      const counts = []
      for (const side of sides) {
        const sweeps = []
        for (let i = 0; i < SWEEP_AA; i++) {
          const { html, url } = await open(side, name, 'plain')
          context.pages.set(new URL(url).pathname, html)
          sweeps.push(await resweepForced(host, url, meta, null, Infinity))
        }
        const keys = Object.keys(sweeps[0].forced)
        const read = (sweep, k) => JSON.stringify(sweep.forced[k] ?? {})
        const disagree = keys.filter(k => new Set(sweeps.map(sweep => read(sweep, k))).size > 1)
        // A disagreement some read of which lost its state is the fixture; one whose held reads still disagree is not.
        const heldReads = k => sweeps.filter(sweep => sweep.samples[k]?.held !== false)
        const unexplained = disagree.filter(k => new Set(heldReads(k).map(sweep => read(sweep, k))).size > 1)
        const notHeld = keys.filter(k => sweeps.some(sweep => sweep.samples[k]?.held === false))
        const timedOut = keys.filter(k => sweeps.some(sweep => sweep.samples[k]?.waited === false))
        // Elements another element's read found hovered, with how many reads found each.
        const strays = Object.entries(Object.groupBy(sweeps.flatMap(sweep => Object.values(sweep.samples).flatMap(sample => sample.stray ?? [])), e => e)).map(
          ([e, list]) => `${e} ×${list.length}`,
        )
        counts.push(
          `${side} ${disagree.length}/${keys.length} disagree, ${disagree.length - unexplained.length} of them with a read whose element lost the state, ${unexplained.length} with every read holding it${unexplained.length ? ` (${unexplained.join(', ')})` : ''}; states not held on some read ${notHeld.length}, waits timed out ${timedOut.length}; stray hovers ${strays.length ? strays.join(', ') : 'none'}`,
        )
        for (const k of disagree) {
          const props = [...new Set(sweeps.flatMap(sweep => Object.keys(sweep.forced[k] ?? {})))]
          const differing = props.filter(prop => new Set(sweeps.map(sweep => sweep.forced[k]?.[prop] ?? '(unchanged)')).size > 1)
          const box = b => (b ? `${b.overflowsX ? 'overflows' : 'fits'} bar ${b.bar} ${b.overflowX} h ${b.height}` : '-')
          const sample = sweep =>
            `${sweep.samples[k]?.held === false ? 'not held' : 'held'}${sweep.samples[k]?.stray ? `, stray hover ${sweep.samples[k].stray.join(', ')}` : ''}${sweep.samples[k]?.waited === false ? ', wait timed out' : ''}; fixture ${box(sweep.samples[k]?.layout?.fixture)}; document ${box(sweep.samples[k]?.layout?.document)}`
          console.log(
            `  ${name} ${side} ${k}${unexplained.includes(k) ? ' UNEXPLAINED' : ''}: ${differing.length} value(s) differ, first ${differing[0]}: ${sweeps.map(sweep => `${JSON.stringify(sweep.forced[k]?.[differing[0]] ?? '(unchanged)')} (${sample(sweep)})`).join(' / ')}`,
          )
        }
      }
      console.log(
        `sweep A/A ${name}, ${SWEEP_AA} sweeps per side: states a side's own sweeps disagree on: ${counts.join('; ')} (load ${loadavg()[0].toFixed(2)} at ${new Date().toISOString()})`,
      )
    }
  } else if (READ_FORCED) {
    for (const [name, key] of READ_FORCED) {
      const meta = metas.find(m => m.name === name)?.meta
      if (!meta) throw new Error(`--read-forced: ${name} is not among the cases of this run`)
      const reads = {}
      for (const side of sides) {
        const memo = await forcedOnReload({ label: `read ${side}`, side, name, mode: 'plain', meta }, [key], READ_LOADS, new Map())
        reads[side] = memo.get(key).map(v => JSON.stringify(v ?? {}))
      }
      const modal = list => [...Object.entries(Object.groupBy(list, v => v))].sort((a, b) => b[1].length - a[1].length)[0][0]
      const sideModal = Object.fromEntries(sides.map(side => [side, modal(reads[side])]))
      const line = sides.map(side => `${side} ${reads[side].filter(v => v !== sideModal[side]).length}/${reads[side].length}`).join(', ')
      const agree = sides.every(side => sideModal[side] === sideModal[sides[0]])
      console.log(
        `read ${name} ${key}: loads off each side's most common read: ${line}; most common reads ${agree ? 'agree' : 'DIFFER'} across sides (load ${loadavg()[0].toFixed(2)} at ${new Date().toISOString()})`,
      )
    }
  } else if (PLANT_RUN) {
    const meta = metas[0].meta
    const oracle = await record('runtime', PLANT_CASE, 'plain', meta)
    const cleanSide = await record('off', PLANT_CASE, 'plain', meta)
    const clean = [...compareRecords(oracle, cleanSide), ...compareExact(cleanSide.record, (await record('off', PLANT_CASE, 'plain', meta)).record)]
    if (clean.length) {
      failures++
      console.log(
        `FAIL the unplanted comparison is not clean: ${clean
          .slice(0, 5)
          .map(d => `${d.dimension} ${d.text}`)
          .join(' | ')}`,
      )
    }
    const reloads = new Map()
    const specOf = (label, plant) => ({ label, side: 'off', name: PLANT_CASE, mode: 'plain', meta, plant })
    for (const plant of pick(PLANTS)) {
      if (plant.input && !FORCE_BY_INPUT) {
        console.log(`skipped plant ${plant.dimension} ${plant.name}: states are forced through the DevTools protocol, so no pointer moves`)
        continue
      }
      let side
      let found
      try {
        side = await record('off', PLANT_CASE, 'plain', meta, plant)
      } catch (error) {
        // A plant can fail the page itself, as a row's page fails.
        found = [{ dimension: 'hydration', where: 'page', text: `the page failed: ${error.message}` }]
      }
      if (side) {
        if (plant.html) side.html = plant.html(side.html)
        // Exact markup compares a compiled side with another, so its plant is checked against the unplanted "off" record.
        found = [...compareRecords(oracle, side), ...compareExact(cleanSide.record, side.record)]
      }
      // A plant the harness recovers from must leave no difference, and its recovery must have happened.
      if (plant.recovers) {
        const recovered = !found.length && side?.record[plant.recovers] != null
        if (!recovered) failures++
        console.log(
          `${recovered ? 'recovered' : 'FAIL'} plant ${plant.dimension} ${plant.name}: ${found.length} difference(s)${found.length ? ` (${found.slice(0, 2).map(d => d.text).join(' | ')})` : ''}, ${plant.recovers} ${JSON.stringify(side?.record[plant.recovers] ?? null)}`,
        )
        continue
      }
      // The planted page is confirmed as the compared page of an "on" row: only the oracle or the unplanted "off" side may excuse a state.
      const pages = {
        oracle: { spec: { ...specOf('runtime'), side: 'runtime' }, record: oracle.record },
        off: { spec: specOf('off'), record: cleanSide.record },
        compared: { spec: specOf(`planted ${plant.name ?? plant.dimension}`, plant), record: side?.record },
      }
      const before = found.length
      const confirmation = side ? await confirmForced(found, pages, reloads) : { found, unstable: [], outliers: [], confirmed: [], onlyCompared: [], swept: {}, reloadReproduced: {} }
      noteOnlyCompared({ case: PLANT_CASE, mode: 'plain', side: `plant ${plant.name ?? plant.dimension}` }, confirmation.onlyCompared)
      found = confirmation.found
      noteUnstable({ case: PLANT_CASE, mode: 'plain', side: `plant ${plant.name ?? plant.dimension}` }, confirmation.unstable)
      noteOutliers({ case: PLANT_CASE, mode: 'plain', side: `plant ${plant.name ?? plant.dimension}` }, confirmation.outliers, confirmation.swept)
      // A plant the confirmation must excuse leaves no difference once its states are left out as unstable.
      if (plant.excused) {
        const excused = !found.length && confirmation.unstable.length > 0
        if (!excused) failures++
        console.log(
          `${excused ? 'excused' : 'FAIL'} plant ${plant.dimension} ${plant.name}: ${before} difference(s) before confirming, ${found.length} after${found.length ? ` (${found.slice(0, 2).map(d => `${d.where}: ${d.text}`).join(' | ')})` : ''}; left out as unstable: ${confirmation.unstable.join(', ') || 'none'}`,
        )
        continue
      }
      // A check with no plant: both pages hold an element only a forced state has, and nothing differs.
      if (plant.alike) {
        const stateOnly = record => Object.values(record.forced).filter(read => Object.keys(read).some(entry => entry.startsWith('+'))).length
        const alike = !found.length && stateOnly(oracle.record) > 0 && stateOnly(side.record) > 0
        if (!alike) failures++
        console.log(
          `${alike ? 'alike' : 'FAIL'} plant ${plant.dimension} ${plant.name}: ${found.length} difference(s)${found.length ? ` (${found.slice(0, 2).map(d => `${d.where}: ${d.text}`).join(' | ')})` : ''}; forced states with an element only the state has: oracle ${stateOnly(oracle.record)}, planted page ${stateOnly(side.record)}`,
        )
        continue
      }
      // Under real input, a plant that names a confirmation outcome must reach it.
      if (FORCE_BY_INPUT && plant.confirm) {
        // In session only: every repeated sweep reproduces it, and no fresh-load read of the state alone does.
        const inSession = confirmation.confirmed.filter(k => confirmation.swept[k].compared[0] === RESWEEPS && confirmation.reloadReproduced[k][0] === 0)
        const reached =
          plant.confirm === 'stable'
            ? confirmation.confirmed.length > 0 && !confirmation.onlyCompared.length
            : plant.confirm === 'in-session'
              ? inSession.length > 0
              : confirmation.onlyCompared.length > 0
        if (!reached) failures++
        console.log(
          `${reached ? 'confirmed' : 'FAIL'} plant ${plant.dimension} ${plant.name}: ${confirmation.confirmed.length} state(s) confirmed, ${confirmation.onlyCompared.length} varying on the planted page only, ${inSession.length} reproduced in every sweep and on no fresh load, ${confirmation.unstable.length} excused as unstable, ${confirmation.outliers.length} as outliers`,
        )
      }
      const ofDimension = found.filter(d => d.dimension === plant.dimension)
      // A plant that names its exact differences must make those and no others in its dimension.
      const exactStates = plant.exactly?.states[FORCE_BY_INPUT ? 'input' : 'protocol']
      const exact = !plant.exactly || isExactly(ofDimension, plant.exactly.text, exactStates)
      // A plant that names a text must make a difference of its dimension holding it.
      const named = !plant.text || ofDimension.some(d => d.text.includes(plant.text))
      const caught = ofDimension.length > 0 && exact && named
      if (!caught) failures++
      console.log(
        `${caught ? 'caught' : 'MISSED'} plant ${plant.dimension}${plant.name ? ` ${plant.name}` : ''}: ${found.length} difference(s) in ${[...new Set(found.map(d => d.dimension))].join(', ') || 'none'}${plant.exactly ? `; ${ofDimension.length} in ${plant.dimension}, ${exact ? 'exactly as planted' : `not ${exactStates.join(', ')} of one element, each holding "${plant.exactly.text}": ${ofDimension.slice(0, 3).map(d => `${d.where}: ${d.text}`).join(' | ')}`}` : ''}${plant.text ? `; ${named ? `${plant.dimension} @ ${ofDimension.find(d => d.text.includes(plant.text)).where}: ${ofDimension.find(d => d.text.includes(plant.text)).text}` : `none holding "${plant.text}"`}` : ''}`,
      )
      // A recorded difference excuses what it matches and nothing else, and one that matches nothing is reported.
      const mine = found.find(d => d.dimension === plant.dimension)
      if (mine) {
        const excused = applyExpected(found, [{ reason: 'planted', sides: ['off'], dimension: mine.dimension, text: mine.text }], 'off')
        const absent = applyExpected([], [{ reason: 'planted', sides: ['off'], dimension: mine.dimension, text: mine.text }], 'off')
        const ok =
          excused.expected[0].matched > 0 &&
          !excused.found.some(d => d.dimension === mine.dimension && d.text === mine.text) &&
          absent.expected[0].matched === 0
        if (!ok) {
          failures++
          console.log(`FAIL recorded differences do not excuse or report plant ${plant.dimension} as they should`)
        }
        // One that names engines: on its own engine it excuses and must appear; on another it does neither.
        const pin = { reason: 'planted', sides: ['off'], dimension: mine.dimension, text: mine.text }
        const other = ENGINE === 'chromium' ? 'webkit' : 'chromium'
        const here = applyExpected(found, [{ ...pin, engines: [ENGINE] }], 'off')
        const hereAbsent = applyExpected([], [{ ...pin, engines: [ENGINE] }], 'off')
        const elsewhere = applyExpected(found, [{ ...pin, engines: [other] }], 'off')
        const engineOk =
          here.expected[0]?.matched > 0 &&
          !here.found.some(d => d.dimension === mine.dimension && d.text === mine.text) &&
          hereAbsent.expected.length === 1 &&
          hereAbsent.expected[0].matched === 0 &&
          elsewhere.expected.length === 0 &&
          elsewhere.found.some(d => d.dimension === mine.dimension && d.text === mine.text)
        if (!engineOk) {
          failures++
          console.log(`FAIL a recorded difference that names engines does not apply on ${ENGINE} alone for plant ${plant.dimension}`)
        }
      }
    }
    // The registry check's plants: the [registry] page changed alike on the oracle and "off", which their own row cannot see.
    for (const plant of pick(MODE_PLANTS)) {
      const plain = await record('runtime', PLANT_CASE, 'plain', meta)
      const planted = await record('runtime', PLANT_CASE, 'registry', meta, plant)
      const alike = compareRecords(planted, await record('off', PLANT_CASE, 'registry', meta, plant))
      const { found } = await compareModes(PLANT_CASE, meta, plain, planted, plant)
      const caught = found.some(d => d.dimension === plant.dimension)
      if (!caught) failures++
      console.log(
        `${caught ? 'caught' : 'MISSED'} registry plant ${plant.name}: ${found.length} difference(s) in ${[...new Set(found.map(d => d.dimension))].join(', ') || 'none'}; the [registry] row with both sides planted alike reads ${alike.length}`,
      )
    }
    // Compiled plants: the oracle against a rewritten "on" output, beside the unrewritten one.
    for (const plant of pick(COMPILED_PLANTS)) {
      /** The plant's case, and its client-only variant when it names one. */
      const plantCases = [plant.case, ...(plant.client ? [plant.client] : [])]
      const sideBuilt = {}
      for (const [name, rewrite] of [
        ['on', null],
        ['planted', plant.rewrite],
      ]) {
        const { dir, compiled, parts } = await buildSide({ ...SIDES.on, name, rewrite }, plantCases)
        const ssr = await serverRender(dir, plantCases)
        // A plant on the server HTML rewrites the [plain] page the planted side serves.
        if (name === 'planted' && plant.html) {
          const page = ssr.plain[plant.case]
          ssr.plain[plant.case] = { ...page, head: plant.html(page.head), body: plant.html(page.body) }
        }
        built[name] = sideBuilt[name] = { dir, compiled, parts, ssr, client: readFileSync(join(dir, 'client.js'), 'utf8') }
      }
      if (plantCases.some(c => !built.runtime.ssr.plain[c])) {
        const { dir, compiled } = await buildSide(SIDES.runtime, plantCases)
        const ssr = await serverRender(dir, plantCases)
        built.runtime = { dir, compiled, ssr, client: readFileSync(join(dir, 'client.js'), 'utf8') }
      }
      // The rewrite reaches the case module and every part it may import, or the server HTML.
      const pageOf = side => sideBuilt[side].ssr.plain[plant.case]
      const changed =
        sideBuilt.on.compiled[plant.case] !== sideBuilt.planted.compiled[plant.case] ||
        Object.keys(sideBuilt.on.parts).some(part => sideBuilt.on.parts[part] !== sideBuilt.planted.parts[part]) ||
        pageOf('on').head + pageOf('on').body !== pageOf('planted').head + pageOf('planted').body
      if (plantCases.some(c => !built.off?.ssr.plain[c])) {
        const { dir, compiled } = await buildSide(SIDES.off, plantCases)
        const ssr = await serverRender(dir, plantCases)
        built.off = { dir, compiled, ssr, client: readFileSync(join(dir, 'client.js'), 'utf8') }
      }
      const text = d => `${d.dimension} ${d.where} ${d.text}`
      // Each server mode the case runs in: a rewrite may change nothing in one mode and show in another (the carrier
      // mark is redundant where [plain] renders style slots, and holds identity in [registry]).
      const byMode = []
      for (const name of plantCases) {
        const caseMeta = (await import(pathToFileURL(join(built.runtime.dir, 'corpus', `${name}.mjs`)).href)).meta
        for (const mode of caseMeta.serverModes ?? ['plain', 'registry']) {
          const oracle = await record('runtime', name, mode, caseMeta)
          const clean = new Set(compareRecords(oracle, await record('on', name, mode, caseMeta)).map(text))
          const html = s => built[s].ssr[mode][name].head + built[s].ssr[mode][name].body
          for (const d of compareRuleText(html('off'), html('on'), compile)) clean.add(text(d))
          const found = [
            ...compareRecords(oracle, await record('planted', name, mode, caseMeta)),
            ...compareRuleText(html('off'), html('planted'), compile),
          ].filter(d => !clean.has(text(d)))
          byMode.push({ mode: name === plant.case ? mode : `client ${mode}`, found })
        }
      }
      // A plant that names a dimension must show there, not only elsewhere, in some mode; one with `noDifference` must
      // show in none.
      const shows = ({ found }) => found.length > 0 && (!plant.dimension || found.some(d => d.dimension === plant.dimension))
      const caught = plant.noDifference ? changed && byMode.every(m => m.found.length === 0) : changed && byMode.some(shows)
      if (!caught) failures++
      const outcome = plant.noDifference ? (caught ? 'held' : 'BROKEN') : caught ? 'caught' : 'MISSED'
      const modes = byMode
        .map(({ mode, found }) => `[${mode}] ${found.length} new difference(s) in ${[...new Set(found.map(d => d.dimension))].join(', ') || 'none'}`)
        .join('; ')
      console.log(
        `${outcome} compiled plant "${plant.name}": ${changed ? '' : 'the rewrite changed nothing; '}${modes}${plant.noDifference ? ` (expected none: ${plant.noDifference})` : ''}`,
      )
    }
    const planted = new Set(PLANTS.map(p => p.dimension))
    for (const d of DIMENSIONS) if (!planted.has(d)) console.log(`note: dimension ${d} has no plant`)
  } else {
    /** Reads one case: every mode's oracle, the registry check and each compared side. */
    const readCase = async ({ name, meta }) => {
      const started = Date.now()
      /** Each mode's oracle record, for the registry check. */
      const oracles = {}
      for (const mode of meta.serverModes ?? ['plain', 'registry']) {
        const errors = sides.map(s => [s, built[s].ssr[mode][name].error]).filter(([, e]) => e)
        if (errors.length) {
          failures += errors.length
          for (const [s, e] of errors) console.log(`FAIL ${name} [${mode}] ${s}: the server render threw: ${e.split('\n').slice(0, 3).join(' | ')}`)
          continue
        }
        let oracle
        startRow({ case: name, mode, side: 'runtime' })
        try {
          oracle = await record('runtime', name, mode, meta)
          noteReload({ case: name, mode, side: 'runtime' }, oracle)
        } catch (error) {
          failures++
          console.log(`FAIL ${name} [${mode}] runtime: the oracle page failed: ${error.message}`)
          continue
        }
        oracles[mode] = oracle
        if (mode === 'registry' && oracles.plain) {
          startRow({ case: name, mode, side: MODES_SIDE })
          const confirmation = await compareModes(name, meta, oracles.plain, oracle)
          noteOnlyCompared({ case: name, mode, side: MODES_SIDE }, confirmation.onlyCompared)
          noteOutliers({ case: name, mode, side: MODES_SIDE }, confirmation.outliers, confirmation.swept)
          finishRow(name, mode, MODES_SIDE, meta, confirmation.found, oracles.plain, confirmation.unstable, confirmation.snapped)
        }
        const records = {}
        // Reloads for confirming forced states, shared by this case and mode's rows.
        const reloads = new Map()
        const specOf = side => ({ label: side, side, name, mode, meta })
        for (const side of COMPARED) {
          let all
          let left = []
          let snaps = []
          startRow({ case: name, mode, side })
          try {
            records[side] = await record(side, name, mode, meta)
            noteReload({ case: name, mode, side }, records[side])
            const compareStarted = performance.now()
            all = compareRecords(oracle, records[side])
            snaps = all.snapped
            // The nodes that must render as with extraction off, compared with the "off" record exactly.
            if (side === 'on' && records.off && records.on.record.exact?.length) all.push(...compareExact(records.off.record, records.on.record))
            // Every selector's rules, "off" against "on", from the server CSS text.
            if (side === 'on' && built.off && meta.render !== 'client')
              all.push(
                ...compareRuleText(
                  built.off.ssr[mode][name].head + built.off.ssr[mode][name].body,
                  built.on.ssr[mode][name].head + built.on.ssr[mode][name].body,
                  compile,
                ),
              )
            spend('compare', performance.now() - compareStarted)
            const pages = {
              oracle: { spec: specOf('runtime'), record: oracle.record },
              off: records.off && { spec: specOf('off'), record: records.off.record },
              compared: { spec: specOf(side), record: records[side].record },
            }
            const confirmation = await confirmForced(all, pages, reloads)
            noteOnlyCompared({ case: name, mode, side }, confirmation.onlyCompared)
            noteReloads({ case: name, mode, side }, confirmation.varied)
            noteOutliers({ case: name, mode, side }, confirmation.outliers, confirmation.swept)
            all = confirmation.found
            left = confirmation.unstable
          } catch (error) {
            all = [{ dimension: 'hydration', where: 'page', text: `the page failed: ${error.message}` }]
          }
          finishRow(name, mode, side, meta, all, oracle, left, snaps)
        }
      }
      timings[name] = Date.now() - started
      phaseSink = null
    }
    if (WORKER) {
      // Asks the coordinator for a case, reads it, and sends back its lines and records, until none are left.
      const nextCase = () =>
        new Promise(resolve => {
          process.once('message', message => resolve(message.index))
          process.send({ type: 'next' })
        })
      for (let index = await nextCase(); index !== null; index = await nextCase()) {
        const mark = { failures, blockers: new Set(blockers), ...Object.fromEntries(Object.entries(GATHERED).map(([key, list]) => [key, list.length])) }
        const scope = { lines: [], rows: [], sink: null }
        await caseScope.run(scope, () => readCase(metas[index]))
        process.send({
          type: 'case',
          index,
          lines: scope.lines,
          rows: scope.rows,
          failures: failures - mark.failures,
          blockers: [...blockers].filter(b => !mark.blockers.has(b)),
          timing: timings[metas[index].name],
          gathered: Object.fromEntries(Object.entries(GATHERED).map(([key, list]) => [key, list.slice(mark[key])])),
        })
      }
      await new Promise(resolve => process.send({ type: 'totals', phaseTotals }, resolve))
    } else if (WORKERS > 1 && metas.length > 1) {
      // The coordinator: WORKERS processes, each with its own browser, take the next case in turn; each case's
      // lines and records are added once every case before it has been, so the log and report read as a serial run's.
      const file = join(BUILD_CACHE, `built-${process.pid}.json`)
      writeFileSync(file, JSON.stringify(Object.fromEntries(sides.map(s => [s, { dir: built[s].dir, ssr: built[s].ssr, compiled: built[s].compiled, parts: built[s].parts }]))))
      const results = []
      const children = []
      let next = 0
      let added = 0
      const add = () => {
        for (; added < metas.length && results[added]; added++) {
          const result = results[added]
          for (const parts of result.lines) print(...parts)
          rowPhases.push(...result.rows)
          for (const [key, list] of Object.entries(result.gathered)) GATHERED[key].push(...list)
          failures += result.failures
          for (const b of result.blockers) blockers.add(b)
          timings[metas[added].name] = result.timing
        }
      }
      try {
        await Promise.all(
          Array.from(
            { length: Math.min(WORKERS, metas.length) },
            () =>
              new Promise((resolve, reject) => {
                const child = fork(fileURLToPath(import.meta.url), process.argv.slice(2), {
                  env: { ...process.env, PARITY_WORKER: '1', PARITY_BUILT: file },
                  stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
                })
                child.on('message', message => {
                  if (message.type === 'next') child.send({ index: next < metas.length ? next++ : null })
                  else if (message.type === 'case') {
                    results[message.index] = message
                    add()
                  } else if (message.type === 'totals')
                    // The browser phase's own phases; the build, checks and load wait are the coordinator's.
                    for (const [phase, ms] of Object.entries(message.phaseTotals))
                      if (!['build', 'rsc', 'ssr', 'checks', 'load wait'].includes(phase)) phaseTotals[phase] = (phaseTotals[phase] ?? 0) + ms
                })
                children.push(child)
                child.on('exit', code => {
                  if (code === 0) return resolve()
                  // One worker failing fails the run: stop the others, so none reads on against a cache the next run rebuilds.
                  for (const other of children) if (other.exitCode === null) other.kill()
                  reject(new Error(`a parity worker exited with code ${code}`))
                })
              }),
          ),
        )
      } finally {
        rmSync(file, { force: true })
      }
      if (added < metas.length) throw new Error(`the workers read ${added} of ${metas.length} cases`)
    } else for (const entry of metas) await readCase(entry)
  }
} finally {
  await browser.close()
}
// A worker's cases went back to the coordinator, which reports them.
if (WORKER) process.exit(0)
if (REPORT)
  writeFileSync(
    REPORT,
    JSON.stringify({
      engine: ENGINE,
      wasm: WASM,
      wasmSha256: WASM_SHA256,
      shard: process.env.PARITY_SHARD ?? null,
      differences: report,
      blockers: [...blockers],
      unstable,
      snapped,
      onlyCompared,
      reloadCounts,
      outliers,
      reloaded,
      timings,
      phases: { totals: phaseTotals, build: buildPhases, rows: rowPhases },
    }),
  )
if (unstable.length) {
  console.log(`unstable forced states left out on ${ENGINE}: ${unstable.reduce((n, u) => n + u.states.length, 0)} in ${unstable.length} row(s)`)
  const byCase = Object.groupBy(unstable, u => u.case)
  for (const [name, rows] of Object.entries(byCase)) console.log(`  ${name}: ${[...new Set(rows.flatMap(u => u.states))].join(', ')}`)
}
if (snapped.length) {
  console.log(`layout snapping left out on ${ENGINE}: ${snapped.reduce((n, u) => n + u.differences.length, 0)} difference(s) in ${snapped.length} row(s)`)
  for (const [name, rows] of Object.entries(Object.groupBy(snapped, u => u.case))) console.log(`  ${name}: ${rows.reduce((n, u) => n + u.differences.length, 0)}`)
}
if (reloaded.length) {
  console.log(`pages reloaded once for a stray :hover on ${ENGINE}: ${reloaded.length}`)
  for (const [name, rows] of Object.entries(Object.groupBy(reloaded, u => u.case))) console.log(`  ${name}: ${rows.map(u => `[${u.mode}] ${u.side}`).join(', ')}`)
}
if (outliers.length) {
  console.log(`sweep outliers left out on ${ENGINE}: ${outliers.reduce((n, u) => n + u.states.length, 0)} in ${outliers.length} row(s)`)
  for (const [name, rows] of Object.entries(Object.groupBy(outliers, u => u.case)))
    console.log(`  ${name}: ${[...new Set(rows.flatMap(u => u.states))].join(', ')}`)
}
console.log(phaseLine())
if (blockers.size) console.log(`release blockers (${blockers.size}), pinned and still differing:\n${[...blockers].map(b => `  ${b}`).join('\n')}`)
console.log(
  failures
    ? `parity: FAILED (${failures})`
    : PLANT_RUN
      ? PLANT_FILTER
        ? `parity: every plant named "${PLANT_FILTER}" caught`
        : 'parity: every plant caught'
      : 'parity: all identical',
)
process.exitCode = failures ? 1 : 0
