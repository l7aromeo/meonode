#!/usr/bin/env node
// node compare.mjs <base> <head> [--expect expected-differences.json] [--configs cc,plain] [--rules]
//
// <base> and <head> are run.mjs work directories (every `results-<config>.json`
// in them is compared) or two single results files.
//
// Prints every case whose served or hydrated output differs, grouped so that one
// difference shared by several layouts or configs prints once. Computed style is
// the verdict — what a reader sees. Rule text, token leaks and console output say
// why.
//
// With --expect, each difference is either listed in that file, with the change
// and the changeset or issue that intends it, or it is unexpected. Exit codes:
//   0  no difference, or every difference expected
//   1  an unexpected difference
//   2  the comparison itself cannot be trusted: a config, route or case missing
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { cases } from './corpus.mjs'

const args = process.argv.slice(2)
const flag = name => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args.splice(i, 2)[1]
}
const expectFile = flag('--expect')
const onlyConfigs = flag('--configs')?.split(',')
const showRules = args.includes('--rules') && args.splice(args.indexOf('--rules'), 1)
const [baseSpec, headSpec] = args

function fail(message) {
  console.error(`compare: ${message}`)
  process.exit(2)
}

/** `results-<config>.json` files of a work directory, or the one file given. */
function runsOf(spec) {
  if (!spec || !existsSync(spec)) fail(`no such run: ${spec}`)
  if (!statSync(spec).isDirectory()) {
    const run = JSON.parse(readFileSync(spec, 'utf8'))
    return { [run.config]: run }
  }
  const runs = {}
  for (const name of readdirSync(spec)) {
    const match = name.match(/^results-([a-z-]+)\.json$/)
    if (match && (!onlyConfigs || onlyConfigs.includes(match[1]))) runs[match[1]] = JSON.parse(readFileSync(path.join(spec, name), 'utf8'))
  }
  return runs
}

/** Generated class names → C1, C2… in order of first appearance, per route. */
function labeller() {
  const map = new Map()
  return text =>
    String(text ?? '').replace(/\b(?:[\w-]*css)-[a-z0-9]+\b/g, name => {
      if (!map.has(name)) map.set(name, `C${map.size + 1}`)
      return map.get(name)
    })
}

function describe(entry) {
  if (!entry) return { missing: true }
  const label = labeller()
  const probes = {}
  for (const [name, probe] of Object.entries(entry.probes ?? {})) {
    probes[name] = {
      classes: label((probe.classes ?? []).join(' ')),
      hydratedClasses: label((probe.hydrated?.classes ?? []).join(' ')),
      attrs: probe.attrs,
      // `valid` is false for a condition the browser cannot evaluate: that rule never
      // applies at any width. (`conditionsHold` is only true at the width it was read.)
      rules: (probe.rules ?? []).map(rule => `${rule.dropped || rule.valid === false ? '[NEVER APPLIES] ' : ''}${label(rule.raw)}`),
      rendered: probe.rendered,
      computed: probe.computed ?? {},
      hydratedComputed: probe.hydrated?.computed ?? {},
    }
  }
  return {
    status: entry.status,
    caseError: entry.caseError,
    excluded: entry.excluded,
    leaks: entry.leaks,
    console: (entry.console ?? []).map(line => label(line.replace(/https?:\/\/localhost:\d+/g, ''))),
    probes,
  }
}

const FOLLOWS_COLOR = ['border-top-color', 'outline-color', '::before color']
const instrumentErrors = []

/** Every difference in one route, as records an expectation can match field by field. */
function diffRoute(b, t, streamed) {
  const out = []
  const push = (kind, fields) => out.push({ kind, ...fields })
  if (b.missing || t.missing) return [{ kind: 'route', from: b.missing ? 'missing' : 'present', to: t.missing ? 'missing' : 'present' }]
  if (b.status !== t.status) push('status', { from: b.status, to: t.status })
  if (Boolean(b.excluded) !== Boolean(t.excluded)) push('build', { from: b.excluded ? 'failed' : 'built', to: t.excluded ? 'failed' : 'built' })
  if (b.caseError !== t.caseError) push('render-error', { from: b.caseError ?? null, to: t.caseError ?? null })
  for (const key of ['cssThemeTokens', 'attrThemeTokens', 'cssFunctionSource', 'cssObjectInAttr']) {
    const from = JSON.stringify(b.leaks?.[key] ?? null), to = JSON.stringify(t.leaks?.[key] ?? null)
    if (from !== to) push('leak', { property: key, from, to })
  }
  for (const name of [...new Set([...Object.keys(b.probes), ...Object.keys(t.probes)])].sort()) {
    const bp = b.probes[name], tp = t.probes[name]
    if (!bp || !tp) {
      push('probe', { probe: name, from: bp ? 'present' : 'absent', to: tp ? 'present' : 'absent' })
      continue
    }
    // Streamed (`cpd`) pages, and any boundary a prerender postponed, reveal their
    // content with an inline script, so with JavaScript off the probe is never shown:
    // only the hydrated reading counts.
    const hidden = !streamed && bp.rendered === false && tp.rendered === false
    const phases = streamed || hidden ? [['hydrated1280', bp.hydratedComputed, tp.hydratedComputed]] : [
      ['vp1280', bp.computed.vp1280, tp.computed.vp1280],
      ['vp390', bp.computed.vp390, tp.computed.vp390],
      ['hover1280', bp.computed.hover1280, tp.computed.hover1280],
      ['hydrated1280', bp.hydratedComputed, tp.hydratedComputed],
    ]
    // The pointer is part of the instrument. A static reading of a hovered probe, or a
    // hover reading of one that was not hovered, measured something else.
    for (const [phase, bc = {}, tc = {}] of phases) {
      for (const [side, c] of [['base', bc], ['head', tc]]) {
        if (c[':hover'] === undefined) continue
        const want = phase === 'hover1280' ? 'true' : 'false'
        if (c[':hover'] !== want) instrumentErrors.push(`${side} read probe ${name} at ${phase} with :hover ${c[':hover']}`)
      }
    }
    const styles = new Map()
    for (const [phase, bc = {}, tc = {}] of phases) {
      for (const prop of new Set([...Object.keys(bc), ...Object.keys(tc)])) {
        if (prop === ':hover') continue
        // Sampled mid-animation, so it differs between two runs of one build.
        if (prop === 'opacity' || bc[prop] === tc[prop]) continue
        // These default to currentColor; a change that only follows `color` is not news.
        if (FOLLOWS_COLOR.includes(prop) && bc[prop] === bc.color && tc[prop] === tc.color) continue
        const key = JSON.stringify([prop, bc[prop], tc[prop]])
        styles.set(key, [...(styles.get(key) ?? []), phase])
      }
    }
    for (const [key, where] of styles) {
      const [property, from, to] = JSON.parse(key)
      push('style', { probe: name, property, from: from ?? null, to: to ?? null, where: where.join(' ') })
    }
    if (JSON.stringify(bp.attrs) !== JSON.stringify(tp.attrs)) push('attrs', { probe: name, from: JSON.stringify(bp.attrs), to: JSON.stringify(tp.attrs) })
    if (bp.classes !== tp.classes || bp.hydratedClasses !== tp.hydratedClasses) {
      push('classes', { probe: name, from: `${bp.classes} | ${bp.hydratedClasses}`, to: `${tp.classes} | ${tp.hydratedClasses}` })
    }
    const br = new Set(bp.rules), tr = new Set(tp.rules)
    for (const rule of tr) {
      if (br.has(rule)) continue
      if (rule.startsWith('[NEVER')) push('rule-never-applies', { probe: name, to: rule })
      else if (showRules) push('rule-added', { probe: name, to: rule })
    }
    if (showRules) for (const rule of br) if (!tr.has(rule)) push('rule-removed', { probe: name, from: rule })
  }
  const bc = new Set(b.console), tc = new Set(t.console)
  for (const line of tc) if (!bc.has(line)) push('console-added', { to: line })
  for (const line of bc) if (!tc.has(line)) push('console-removed', { from: line })
  return out
}

// ── Expectations ─────────────────────────────────────────────────────────
const FILTER_FIELDS = ['kind', 'probe', 'property', 'from', 'to']
const expectationsFile = expectFile ? JSON.parse(readFileSync(expectFile, 'utf8')) : { differences: [] }
const expectations = expectationsFile.differences
expectations.forEach((entry, i) => {
  const where = `${expectFile} entry ${i}`
  if (!entry.case || !cases[entry.case]) fail(`${where}: "case" must name a case in corpus.mjs, got ${JSON.stringify(entry.case)}`)
  if (!entry.change || !entry.source) fail(`${where}: every entry needs "change" (what differs) and "source" (the changeset or issue that intends it)`)
  entry.used = 0
})

function expectationFor(diff) {
  return expectations.find(
    entry =>
      entry.case === diff.case &&
      (!entry.layouts || entry.layouts.includes(diff.layout)) &&
      (!entry.configs || entry.configs.includes(diff.config)) &&
      FILTER_FIELDS.every(field => entry[field] === undefined || entry[field] === diff[field]),
  )
}

// ── Compare ──────────────────────────────────────────────────────────────
const baseRuns = runsOf(baseSpec)
const headRuns = runsOf(headSpec)
const configs = [...new Set([...Object.keys(baseRuns), ...Object.keys(headRuns)])].sort()
if (configs.length === 0) fail('no results to compare')
for (const config of configs) if (!baseRuns[config] || !headRuns[config]) fail(`config ${config} was collected on one side only`)

const diffs = []
for (const config of configs) {
  const base = baseRuns[config], head = headRuns[config]
  // Every case must have been collected on both sides, or "no difference" could
  // mean "not looked at".
  for (const run of [base, head]) {
    const collected = new Set(Object.keys(run.results).map(key => key.split('/')[1]))
    const missing = Object.keys(cases).filter(id => !collected.has(id))
    if (missing.length) fail(`${run.label}/${config} did not collect: ${missing.join(', ')}`)
  }
  for (const key of new Set([...Object.keys(base.results), ...Object.keys(head.results)])) {
    const [layout, id] = key.split('/')
    const before = instrumentErrors.length
    for (const diff of diffRoute(describe(base.results[key]), describe(head.results[key]), layout === 'cpd')) diffs.push({ case: id, layout, config, ...diff })
    for (let i = before; i < instrumentErrors.length; i++) instrumentErrors[i] = `${config} ${key}: ${instrumentErrors[i]}`
  }
}
if (instrumentErrors.length) fail(`the pointer was not where a reading needs it:\n  ${instrumentErrors.slice(0, 20).join('\n  ')}${instrumentErrors.length > 20 ? `\n  … ${instrumentErrors.length - 20} more` : ''}`)

// Group identical differences across layouts and configs.
const groups = new Map()
for (const diff of diffs) {
  const expected = expectationFor(diff)
  if (expected) expected.used++
  const { layout, config, ...rest } = diff
  const key = JSON.stringify([rest, expected ? expectations.indexOf(expected) : -1])
  const group = groups.get(key) ?? { diff: rest, expected, layouts: new Set(), configs: new Set() }
  group.layouts.add(layout)
  group.configs.add(config)
  groups.set(key, group)
}

const describeDiff = d => {
  const subject = [d.probe, d.property].filter(Boolean).join(' ')
  const change = d.from !== undefined && d.to !== undefined ? `${d.from} → ${d.to}` : d.to ?? d.from
  return `${d.kind}${subject ? ` ${subject}` : ''}: ${change}${d.where ? `  (${d.where})` : ''}`
}

const first = Object.values(baseRuns)[0], last = Object.values(headRuns)[0]
// Entries describe differences from one baseline; a new release usually contains them.
if (expectationsFile.baseline && expectationsFile.baseline !== first.installed?.installed) {
  console.log(`note: ${path.basename(expectFile)} lists differences from ${expectationsFile.baseline}, but the baseline here is ${first.installed?.installed}.\n`)
}
console.log(`# ${first.label} (${first.installed?.installed}) → ${last.label} (${last.installed?.installed}), configs ${configs.join(', ')}\n`)
const byCase = new Map()
for (const group of groups.values()) byCase.set(group.diff.case, [...(byCase.get(group.diff.case) ?? []), group])
let unexpected = 0
for (const [id, list] of [...byCase.entries()].sort()) {
  console.log(`## ${id}`)
  for (const group of list) {
    const scope = `[${[...group.layouts].join(',')}${group.configs.size === configs.length ? '' : ` · ${[...group.configs].join(',')}`}]`
    if (group.expected) console.log(`- ${scope} ${describeDiff(group.diff)}\n    expected: ${group.expected.change} (${group.expected.source})`)
    else {
      unexpected++
      console.log(`- ${scope} UNEXPECTED ${describeDiff(group.diff)}`)
    }
  }
  console.log('')
}
const identical = Object.keys(cases).filter(id => !byCase.has(id)).length
console.log(`${identical} of ${Object.keys(cases).length} cases identical in every layout and config.`)
const stale = expectations.filter(entry => entry.used === 0)
for (const entry of stale) console.log(`note: expectation for ${entry.case} (${entry.change}) matched nothing; remove it if the baseline already has this change.`)
if (expectFile) {
  console.log(unexpected ? `\n${unexpected} unexpected difference(s). List an intended one in ${path.basename(expectFile)} with the changeset or issue that intends it.` : '\nNo unexpected differences.')
  process.exit(unexpected ? 1 : 0)
}
