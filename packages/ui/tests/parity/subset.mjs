// Picks the fixed subset of cases that old-vs-new harness checks run on
// WebKit and Firefox, where a full run takes hours: a greedy cover, so every
// shape, route, render kind and reading option some case declares appears in
// at least one chosen case. It reads the metas of the last build (run any
// parity command first) and writes subset.json, which is committed so later
// checks run on the same rows; `run.mjs --subset` runs them.
//
// usage: node tests/parity/subset.mjs
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const HERE = import.meta.dirname
const BUILT = join(HERE, '../../node_modules/.cache/parity/runtime/corpus')
/** Always in the subset: the plants' own case, and the generated case whose forced states set WebKit's recorded hover limit. */
const ALWAYS = ['plant-target', 'generated/grammar-101']
/** Generated cases hold about 530 elements each, so a hand-written case covering the same features is preferred. */
const GENERATED_COST = 10

if (!existsSync(BUILT)) throw new Error(`no built cases at ${BUILT}: run \`node tests/parity/run.mjs --no-browser\` first`)
const names = readdirSync(BUILT, { recursive: true })
  .filter(f => f.endsWith('.mjs'))
  .map(f => f.slice(0, -'.mjs'.length))
  .sort()

/** Every feature a case's meta declares, as `kind:value` strings. */
function features(meta) {
  const own = [
    ...meta.shapes.map(s => `shape:${s}`),
    ...meta.routes.map(r => `route:${r}`),
    `render:${meta.render ?? 'hydrate'}`,
    `force:${meta.force ?? 'all'}`,
    `force-scope:${meta.forceScope ?? 'page'}`,
    `environments:${meta.environments ?? 'all'}`,
    ...(meta.steps ?? []).flatMap(step => ['click', 'type', 'mode'].filter(kind => step[kind] !== undefined).map(kind => `step:${kind}`)),
    ...(meta.routing ?? []).filter(r => r.carrier).map(() => 'routing:carrier'),
  ]
  for (const flag of ['firstPaint', 'reducedMotion', 'forceCombos', 'breakpoints', 'expected', 'pageCss', 'customProps']) if (meta[flag] !== undefined) own.push(`option:${flag}`)
  return new Set(own)
}

const cases = []
for (const name of names) {
  const { meta } = await import(pathToFileURL(join(BUILT, `${name}.mjs`)).href)
  if (meta) cases.push({ name, features: features(meta), cost: name.startsWith('generated/') ? GENERATED_COST : 1 })
}

const chosen = cases.filter(c => ALWAYS.includes(c.name))
const covered = new Set(chosen.flatMap(c => [...c.features]))
const all = new Set(cases.flatMap(c => [...c.features]))
while (covered.size < all.size) {
  // Most new features per unit of cost; ties go to the first name, so the pick is the same on every run.
  let best = null
  let bestScore = 0
  for (const c of cases) {
    if (chosen.includes(c)) continue
    const gain = [...c.features].filter(f => !covered.has(f)).length
    if (gain / c.cost > bestScore) {
      best = c
      bestScore = gain / c.cost
    }
  }
  chosen.push(best)
  for (const f of best.features) covered.add(f)
}

const rows = chosen.map(c => c.name).sort()
writeFileSync(join(HERE, 'subset.json'), `${JSON.stringify({ cases: rows, features: all.size }, null, 2)}\n`)
console.log(`subset: ${rows.length} of ${cases.length} cases cover all ${all.size} features`)
