#!/usr/bin/env node
// node compare.mjs <base results.json> <target results.json> [--rules]
//
// Prints every case whose served or hydrated output differs between two runs of
// run.mjs, grouped so that one difference shared by several layouts prints once.
// Computed style is the verdict — what a reader sees. Rule text, token leaks and
// console output say why.
import { readFileSync } from 'node:fs'

const [baseFile, targetFile, ...flags] = process.argv.slice(2)
const showRules = flags.includes('--rules')
// `a.json+b.json` merges a run with a later one that collected extra cases.
const load = spec =>
  spec.split('+').reduce((run, file) => {
    const next = JSON.parse(readFileSync(file, 'utf8'))
    return run ? { ...run, excluded: [...run.excluded, ...next.excluded.filter(e => !run.excluded.some(r => r.key === e.key))], results: { ...run.results, ...next.results } } : next
  }, null)
const base = load(baseFile)
const target = load(targetFile)

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

function diffCase(b, t, streamed) {
  const out = []
  if (b.missing || t.missing) return [`route missing in ${b.missing ? 'base' : 'target'}`]
  if (b.status !== t.status) out.push(`status ${b.status} → ${t.status}`)
  if (b.excluded !== t.excluded) out.push(`build: ${b.excluded ? 'EXCLUDED' : 'built'} → ${t.excluded ? 'EXCLUDED' : 'built'}`)
  if (b.caseError !== t.caseError) out.push(`render error: ${b.caseError ?? '-'} → ${t.caseError ?? '-'}`)
  for (const key of ['cssThemeTokens', 'attrThemeTokens']) {
    const bl = JSON.stringify(b.leaks?.[key] ?? []), tl = JSON.stringify(t.leaks?.[key] ?? [])
    if (bl !== tl) out.push(`unresolved ${key}: ${bl} → ${tl}`)
  }
  for (const key of ['cssFunctionSource', 'cssObjectInAttr']) if (b.leaks?.[key] !== t.leaks?.[key]) out.push(`${key}: ${b.leaks?.[key]} → ${t.leaks?.[key]}`)
  const names = new Set([...Object.keys(b.probes), ...Object.keys(t.probes)])
  for (const name of [...names].sort()) {
    const bp = b.probes[name], tp = t.probes[name]
    if (!bp || !tp) {
      out.push(`probe ${name}: ${bp ? 'present' : 'absent'} → ${tp ? 'present' : 'absent'}`)
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
    const changes = new Map()
    for (const [phase, bc = {}, tc = {}] of phases) {
      for (const prop of new Set([...Object.keys(bc), ...Object.keys(tc)])) {
        // Sampled mid-animation, so it differs between two runs of one build.
        if (prop === 'opacity' || bc[prop] === tc[prop]) continue
        // These default to currentColor; a change that only follows `color` is not news.
        if (FOLLOWS_COLOR.includes(prop) && bc[prop] === bc.color && tc[prop] === tc.color) continue
        const key = `${name} ${prop}: ${bc[prop]} → ${tc[prop]}`
        changes.set(key, [...(changes.get(key) ?? []), phase])
      }
    }
    for (const [key, list] of changes) out.push(`${key}  (${list.join(' ')})`)
    if (JSON.stringify(bp.attrs) !== JSON.stringify(tp.attrs)) out.push(`${name} attrs: ${JSON.stringify(bp.attrs)} → ${JSON.stringify(tp.attrs)}`)
    if (bp.classes !== tp.classes || bp.hydratedClasses !== tp.hydratedClasses) {
      out.push(`${name} classes served/hydrated: "${bp.classes}"/"${bp.hydratedClasses}" → "${tp.classes}"/"${tp.hydratedClasses}"`)
    }
    if (showRules) {
      const br = new Set(bp.rules), tr = new Set(tp.rules)
      for (const rule of br) if (!tr.has(rule)) out.push(`${name} rule only in base:   ${rule}`)
      for (const rule of tr) if (!br.has(rule)) out.push(`${name} rule only in target: ${rule}`)
    } else {
      const never = tp.rules.filter(rule => rule.startsWith('[NEVER'))
      const baseNever = bp.rules.filter(rule => rule.startsWith('[NEVER'))
      for (const rule of never) if (!baseNever.includes(rule)) out.push(`${name} target rule never applies: ${rule}`)
    }
  }
  const bc = new Set(b.console), tc = new Set(t.console)
  for (const line of tc) if (!bc.has(line)) out.push(`console only in target: ${line}`)
  for (const line of bc) if (!tc.has(line)) out.push(`console only in base: ${line}`)
  return out
}

const byCase = new Map()
for (const key of new Set([...Object.keys(base.results), ...Object.keys(target.results)])) {
  const [layout, id] = key.split('/')
  const lines = diffCase(describe(base.results[key]), describe(target.results[key]), layout === 'cpd')
  if (!byCase.has(id)) byCase.set(id, new Map())
  for (const line of lines) {
    const layouts = byCase.get(id).get(line) ?? []
    layouts.push(layout)
    byCase.get(id).set(line, layouts)
  }
}

console.log(`# ${base.label} (${base.installed?.installed}) → ${target.label} (${target.installed?.installed}), config ${target.config}\n`)
const excludedNote = (run, name) => (run.excluded?.length ? `${name} excluded from the build: ${run.excluded.map(e => e.key).join(', ')}\n` : '')
process.stdout.write(excludedNote(base, 'base') + excludedNote(target, 'target'))
let clean = 0
for (const [id, lines] of [...byCase.entries()].sort()) {
  if (lines.size === 0) {
    clean++
    continue
  }
  console.log(`\n## ${id}`)
  for (const [line, layouts] of lines) console.log(`- [${layouts.join(',')}] ${line}`)
}
console.log(`\n${clean} of ${byCase.size} cases identical in every layout.`)
