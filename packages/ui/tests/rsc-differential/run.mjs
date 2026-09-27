#!/usr/bin/env node
/* global fetch, setTimeout, getComputedStyle, CSSStyleSheet, CSS */
// Differential harness for what server components emit, per @meonode/ui version.
//
//   node run.mjs prepare <label> <ui-spec>     copy the fixture, generate pages, install
//   node run.mjs build   <label> <config>      next build (config: plain | cc | plain-compiled | cc-compiled)
//   node run.mjs collect <label> <config>      next start + Chromium, writes results-<config>.json
//   node run.mjs all     <label> <ui-spec> [configs…]
//   node run.mjs pack    <git-ref | .>             build that commit's (or this checkout's) @meonode/ui, print the tarball
//
// <ui-spec> is anything the package manager takes: `3.0.0`, `3.1.0`, or a path
// to a tarball packed under a version no registry has (a matching version would
// be served from the registry instead of the file).
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { cases, clientModules } from './corpus.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORK_ROOT = process.env.RSC_DIFF_WORK || path.join(HERE, '.work')
const LAYOUTS = ['cp', 'sp', 'np', 'cpd']
const CONFIGS = {
  plain: { MEONODE_COMPILED: '0', MEONODE_CACHE_COMPONENTS: '0' },
  cc: { MEONODE_COMPILED: '0', MEONODE_CACHE_COMPONENTS: '1' },
  'plain-compiled': { MEONODE_COMPILED: '1', MEONODE_CACHE_COMPONENTS: '0' },
  'cc-compiled': { MEONODE_COMPILED: '1', MEONODE_CACHE_COMPONENTS: '1' },
}

const workDir = label => path.join(WORK_ROOT, label)
const log = (...args) => console.error('[rsc-diff]', ...args)

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts })
  return { code: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

// ── prepare ──────────────────────────────────────────────────────────────
function prepare(label, spec) {
  const dir = workDir(label)
  mkdirSync(dir, { recursive: true })
  cpSync(path.join(HERE, 'fixture'), dir, { recursive: true, filter: src => !/node_modules|\.next/.test(src) })
  const pkg = JSON.parse(readFileSync(path.join(HERE, 'fixture/package.json'), 'utf8'))
  pkg.dependencies['@meonode/ui'] = spec.endsWith('.tgz') ? `file:${path.resolve(spec)}` : spec
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  writeCases(dir)
  writePages(dir, [])
  const install = sh('bun', ['install'], { cwd: dir })
  if (install.code !== 0) throw new Error(`bun install failed:\n${install.out}`)
  const installed = JSON.parse(readFileSync(path.join(dir, 'node_modules/@meonode/ui/package.json'), 'utf8')).version
  const lock = readFileSync(path.join(dir, 'bun.lock'), 'utf8')
  const lockLine = lock.split('\n').find(line => line.includes('"@meonode/ui@')) ?? ''
  writeFileSync(path.join(dir, 'installed.json'), JSON.stringify({ spec, installed, lockLine: lockLine.trim() }, null, 2))
  log(`${label}: installed @meonode/ui ${installed} (${lockLine.trim().slice(0, 140)})`)
}

function writeCases(dir) {
  const casesDir = path.join(dir, 'app/_cases')
  rmSync(casesDir, { recursive: true, force: true })
  mkdirSync(path.join(casesDir, '_client'), { recursive: true })
  for (const [id, src] of Object.entries(cases)) writeFileSync(path.join(casesDir, `${id}.ts`), src)
  for (const [id, src] of Object.entries(clientModules)) writeFileSync(path.join(casesDir, '_client', `${id}.ts`), src)
}

/**
 * One page per (layout, case). A case that threw synchronously renders an error
 * marker instead of failing the build; one excluded (it failed the build some
 * other way) renders an exclusion marker.
 */
function writePages(dir, excluded) {
  for (const layout of LAYOUTS) {
    const layoutDir = path.join(dir, 'app', layout)
    for (const id of Object.keys(cases)) {
      const pageDir = path.join(layoutDir, id)
      mkdirSync(pageDir, { recursive: true })
      const key = `${layout}/${id}`
      const dynamic = layout === 'cpd'
      const src = excluded.includes(key) || excluded.includes(`*/${id}`)
        ? `import { createElement } from 'react'\n\nexport default function Page() {\n  return createElement('div', { 'data-excluded': ${JSON.stringify(key)} })\n}\n`
        : `import { createElement } from 'react'
${dynamic ? "import { connection } from 'next/server'\n" : ''}import Case from '../../_cases/${id}'

export default async function Page() {
${dynamic ? '  await connection()\n' : ''}  try {
    return await Case()
  } catch (error) {
    return createElement('div', { 'data-case-error': String((error as Error)?.message ?? error).slice(0, 500) })
  }
}
`
      writeFileSync(path.join(pageDir, 'page.ts'), src)
    }
  }
}

// ── pack ─────────────────────────────────────────────────────────────────

/**
 * Builds a commit's `@meonode/ui` in a detached worktree and packs it as
 * `<version>-rscdiff.<sha>`, a version no registry has: a tarball whose version
 * matches a published one is installed from the registry instead of the file.
 */
function pack(ref) {
  const repo = sh('git', ['rev-parse', '--show-toplevel'], { cwd: HERE }).out.trim()
  const sha = sh('git', ['rev-parse', '--short', ref === '.' ? 'HEAD' : ref], { cwd: repo }).out.trim()
  // `.` packs the checkout as it is, dependencies already installed (CI); a ref is
  // checked out into its own worktree first.
  const src = ref === '.' ? repo : path.join(WORK_ROOT, `src-${sha}`)
  if (!existsSync(src)) {
    const add = sh('git', ['worktree', 'add', '--detach', src, sha], { cwd: repo })
    if (add.code !== 0) throw new Error(add.out)
  }
  const steps = [['bun', ['run', 'build'], path.join(src, 'packages/ui')]]
  if (ref !== '.') steps.unshift(['bun', ['install'], src])
  for (const [cmd, args, cwd] of steps) {
    const res = sh(cmd, args, { cwd })
    if (res.code !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${res.out.slice(-3000)}`)
  }
  const pkgFile = path.join(src, 'packages/ui/package.json')
  const original = readFileSync(pkgFile, 'utf8')
  const pkg = JSON.parse(original)
  pkg.version = `${pkg.version}-rscdiff.${sha}`
  writeFileSync(pkgFile, JSON.stringify(pkg, null, 2))
  mkdirSync(WORK_ROOT, { recursive: true })
  const res = sh('npm', ['pack', '--pack-destination', WORK_ROOT], { cwd: path.join(src, 'packages/ui') })
  writeFileSync(pkgFile, original)
  if (res.code !== 0) throw new Error(res.out)
  const tarball = path.join(WORK_ROOT, `meonode-ui-${pkg.version}.tgz`)
  log(`packed ${ref} (${sha}) → ${tarball}`)
  console.log(tarball)
}

// ── build ────────────────────────────────────────────────────────────────
function build(label, config) {
  const dir = workDir(label)
  const excludedFile = path.join(dir, `excluded-${config}.json`)
  const excluded = existsSync(excludedFile) ? JSON.parse(readFileSync(excludedFile, 'utf8')) : []
  // The corpus and fixture may have changed since `prepare`; node_modules stays.
  cpSync(path.join(HERE, 'fixture'), dir, { recursive: true, filter: src => !/node_modules|\.next|package\.json/.test(src) })
  writeCases(dir)
  for (let attempt = 0; attempt < 40; attempt++) {
    writePages(dir, excluded.map(entry => entry.key))
    const distDir = `.next-${config}`
    rmSync(path.join(dir, distDir), { recursive: true, force: true })
    const env = { ...process.env, ...CONFIGS[config], MEONODE_DIST_DIR: distDir, NEXT_TELEMETRY_DISABLED: '1' }
    const res = sh('bunx', ['--bun', 'next', 'build'], { cwd: dir, env })
    writeFileSync(path.join(dir, `build-${config}.log`), res.out)
    if (res.code === 0) {
      writeFileSync(excludedFile, JSON.stringify(excluded, null, 2))
      log(`${label}/${config}: built, ${excluded.length} excluded`)
      return
    }
    const failing = failingKeys(res.out)
    if (failing.length === 0) throw new Error(`${label}/${config}: build failed with no attributable case:\n${res.out.slice(-4000)}`)
    for (const key of failing) {
      if (excluded.some(entry => entry.key === key)) throw new Error(`${label}/${config}: ${key} still failing after exclusion:\n${res.out.slice(-4000)}`)
      excluded.push({ key, error: errorFor(res.out, key) })
      log(`${label}/${config}: excluding ${key}`)
    }
  }
  throw new Error('too many build attempts')
}

/** Routes (`cp/fn-value`) or whole cases (`*∕fn-value`) the build output blames. */
function failingKeys(out) {
  const keys = new Set()
  // Module evaluation failed: every layout importing the case fails the same way.
  for (const match of out.matchAll(/collect (?:configuration|page data) for \/[a-z]+\/([a-z0-9-]+)/g)) keys.add(`*/${match[1]}`)
  for (const match of out.matchAll(/prerendering page "\/([a-z]+)\/([a-z0-9-]+)"/g)) keys.add(`${match[1]}/${match[2]}`)
  if (keys.size === 0) {
    for (const match of out.matchAll(/app\/_cases\/([a-z0-9-]+)\.ts/g)) keys.add(`*/${match[1]}`)
    for (const match of out.matchAll(/app\/(cp|sp|np|cpd)\/([a-z0-9-]+)\/page/g)) keys.add(`${match[1]}/${match[2]}`)
  }
  return [...keys]
}

function errorFor(out, key) {
  const [layout, id] = key.split('/')
  const idx = Math.max(0, layout === '*' ? out.indexOf(id) : out.indexOf(`/${layout}/${id}"`))
  const start = Math.max(0, out.lastIndexOf('\n', Math.max(0, idx - 600)))
  return stripVTControlCharacters(out.slice(start, idx + 900)).trim()
}

// ── collect ──────────────────────────────────────────────────────────────
const CONCURRENCY = Number(process.env.RSC_DIFF_CONCURRENCY) || Math.max(1, Math.min(8, Math.floor(availableParallelism() / 2)))

const PROPS = [
  'color', 'background-color', 'padding-top', 'padding-left', 'margin-top', 'width', 'border-top-color', 'border-top-width',
  'border-top-style', 'border-top-left-radius', 'box-shadow', 'font-family', 'flex-shrink', 'min-height', 'min-width', 'display',
  'grid-template-columns', 'gap', 'animation-name', 'animation-duration', 'transition-duration', 'z-index', 'fill', 'outline-color',
  'outline-width', 'outline-style', 'opacity', '--local',
]

async function collect(label, config) {
  const dir = workDir(label)
  const port = 4100 + Math.floor(Math.random() * 800)
  const env = { ...process.env, ...CONFIGS[config], MEONODE_DIST_DIR: `.next-${config}`, NEXT_TELEMETRY_DISABLED: '1' }
  const server = spawn('bunx', ['--bun', 'next', 'start', '-p', String(port)], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let serverLog = ''
  server.stdout.on('data', d => (serverLog += d))
  server.stderr.on('data', d => (serverLog += d))
  try {
    await waitForServer(port)
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch()
    const results = {}
    try {
      // RSC_DIFF_CASES=a,b collects only those cases, into results-<config>.<RSC_DIFF_TAG>.json.
      const only = process.env.RSC_DIFF_CASES?.split(',')
      const keys = LAYOUTS.flatMap(layout => Object.keys(cases).filter(id => !only || only.includes(id)).map(id => `${layout}/${id}`))
      // Each route gets its own browser contexts, so routes are independent and can
      // be read side by side. Results are keyed, not appended, so order is irrelevant.
      let next = 0
      const worker = async () => {
        while (next < keys.length) {
          const key = keys[next++]
          results[key] = await collectRoute(browser, port, `/${key}`)
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    } finally {
      await browser.close()
    }
    const installed = JSON.parse(readFileSync(path.join(dir, 'installed.json'), 'utf8'))
    const excludedFile = path.join(dir, `excluded-${config}.json`)
    const excluded = existsSync(excludedFile) ? JSON.parse(readFileSync(excludedFile, 'utf8')) : []
    const outFile = path.join(dir, `results-${config}${process.env.RSC_DIFF_TAG ? `.${process.env.RSC_DIFF_TAG}` : ''}.json`)
    // Sorted, so two collections of one build are byte-comparable whatever order the workers finished in.
    const sorted = Object.fromEntries(Object.keys(results).sort().map(key => [key, results[key]]))
    writeFileSync(outFile, JSON.stringify({ label, config, installed, excluded, results: sorted }, null, 1))
    writeFileSync(path.join(dir, `server-${config}.log`), serverLog)
    log(`${label}/${config}: collected ${Object.keys(results).length} routes → ${outFile}`)
  } finally {
    server.kill('SIGTERM')
  }
}

async function waitForServer(port) {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/`)
      if (res.status > 0) return
    } catch {
      // Not listening yet.
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('server did not start')
}

async function collectRoute(browser, port, route) {
  const url = `http://localhost:${port}${route}`
  const response = await fetch(url)
  const html = await response.text()
  const entry = { status: response.status, leaks: leaks(html) }
  const marker = html.match(/data-(case-error|excluded)="([^"]*)"/)
  if (marker) entry[marker[1] === 'excluded' ? 'excluded' : 'caseError'] = marker[2]

  // The served document, JavaScript off: what the page shows before hydration.
  const served = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } })
  try {
    const page = await served.newPage()
    await page.goto(url)
    await park(page)
    entry.probes = await readProbes(page, true)
    await page.setViewportSize({ width: 390, height: 800 })
    await park(page)
    mergeComputed(entry.probes, await readProbes(page, false), 'vp390')
    await page.setViewportSize({ width: 1280, height: 800 })
    for (const name of Object.keys(entry.probes)) {
      const handle = await page.$(`[data-probe="${name}"]`)
      if (!handle) continue
      await park(page)
      await handle.hover({ force: true }).catch(() => {})
      const hovered = await readProbes(page, false)
      entry.probes[name].computed.hover1280 = hovered[name]?.computed.vp1280
    }
  } finally {
    await served.close()
  }

  // The hydrated document.
  const live = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  try {
    const page = await live.newPage()
    const consoleLines = []
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') consoleLines.push(`${msg.type()}: ${msg.text().slice(0, 400)}`)
    })
    page.on('pageerror', error => consoleLines.push(`pageerror: ${String(error).slice(0, 400)}`))
    await page.goto(url)
    await page.waitForFunction(() => document.readyState === 'complete' && document.documentElement.getAttribute('data-hydrated') === '1', null, { timeout: 15000 }).catch(() => consoleLines.push('harness: hydration marker not seen'))
    // A streamed Suspense boundary's content sits in a hidden template until it is revealed.
    await page.waitForFunction(() => [...document.querySelectorAll('[data-probe]')].every(el => el.getClientRects().length > 0), null, { timeout: 5000 }).catch(() => consoleLines.push('harness: a probe never became visible'))
    await page.waitForTimeout(150)
    await park(page)
    const hydrated = await readProbes(page, false)
    for (const [name, probe] of Object.entries(hydrated)) {
      entry.probes[name] ??= { classes: [], rules: [], computed: {} }
      entry.probes[name].hydrated = { classes: probe.classes, computed: probe.computed.vp1280 }
    }
    entry.console = consoleLines
  } finally {
    await live.close()
  }
  return entry
}

/**
 * Rests the pointer on the fixture's parking spot, so no probe is under it.
 * Where a headless browser places the pointer before any move is its own
 * business, and on Linux it is over the page origin, where most probes render.
 */
async function park(page) {
  const { width, height } = page.viewportSize()
  // Resolves once the browser has handled the move; the next getComputedStyle
  // recalculates style with the new hover state. Each reading records `:hover`,
  // so compare.mjs can tell if this ever stops holding.
  await page.mouse.move(width - 6, height - 6)
}

function mergeComputed(target, source, key) {
  for (const [name, probe] of Object.entries(source)) {
    target[name] ??= { classes: probe.classes, rules: [], computed: {} }
    target[name].computed[key] = probe.computed.vp1280
  }
}

/** Unresolved tokens and function source left in the served stylesheets and attributes. */
function leaks(html) {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n')
  const attrs = [...html.matchAll(/\s(?:class|style|data-token)="([^"]*)"/g)].map(match => match[1]).join('\n')
  return {
    // A token is `theme.` not preceded by a name character, `.` or `#`: `.theme.accent` is a selector.
    cssThemeTokens: [...new Set(css.match(/(?<![\w.#$-])theme\.[\w.]+/g) ?? [])],
    cssFunctionSource: /=>|function\s*\(/.test(css),
    attrThemeTokens: [...new Set(attrs.match(/(?<![\w.#$-])theme\.[\w.]+/g) ?? [])],
    cssObjectInAttr: /css="\[object Object\]"/.test(html),
  }
}

async function readProbes(page, withRules) {
  return page.evaluate(
    ({ props, withRules }) => {
      const GENERATED = /^(?:[\w-]*css)-[a-z0-9]+$/
      const out = {}
      const styleText = withRules ? [...document.querySelectorAll('style')].map(el => el.textContent ?? '') : []
      const blocks = []
      for (const text of styleText) {
        let depth = 0
        let start = 0
        for (let i = 0; i < text.length; i++) {
          if (text[i] === '{') depth++
          else if (text[i] === '}' && --depth === 0) {
            blocks.push(text.slice(start, i + 1).trim())
            start = i + 1
          }
        }
      }
      for (const el of document.querySelectorAll('[data-probe]')) {
        const name = el.getAttribute('data-probe')
        const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
        const cs = getComputedStyle(el)
        const before = getComputedStyle(el, '::before')
        const computed = Object.fromEntries(props.map(p => [p, cs.getPropertyValue(p).trim()]))
        // Instrument state, not style: compare.mjs refuses a static reading taken
        // while the probe was hovered, and a hover reading taken while it was not.
        computed[':hover'] = String(el.matches(':hover'))
        computed['::before content'] = before.getPropertyValue('content')
        computed['::before color'] = before.getPropertyValue('color')
        const rules = []
        if (withRules) {
          for (const cls of classes.filter(c => GENERATED.test(c))) {
            const needle = new RegExp(`\\.${cls}(?![\\w-])`)
            for (const block of blocks) {
              if (!needle.test(block)) continue
              const sheet = new CSSStyleSheet()
              let parsed
              const conditions = []
              try {
                sheet.replaceSync(block)
                const walk = rule => {
                  if (rule.media) conditions.push(`@media ${rule.media.mediaText}`)
                  else if (rule.conditionText !== undefined) conditions.push(`${rule.constructor.name}:${rule.conditionText}`)
                  if (rule.cssRules) for (const inner of rule.cssRules) walk(inner)
                }
                for (const rule of sheet.cssRules) walk(rule)
                parsed = [...sheet.cssRules].map(rule => rule.cssText).join(' ')
              } catch (error) {
                parsed = `PARSE ERROR ${error}`
              }
              // Chrome keeps an unparseable condition's text as written, so its text cannot
              // tell it apart. Three-valued logic can: a valid condition makes exactly one
              // of \`q\` and \`not q\` match, an unknown one makes both false.
              const valid = conditions.every(c => !c.startsWith('@media ') || window.matchMedia(c.slice(7)).matches !== window.matchMedia(`not ${c.slice(7)}`).matches)
              const conditionsHold = conditions.every(c => {
                if (c.startsWith('@media ')) return c !== '@media not all' && window.matchMedia(c.slice(7)).matches
                if (c.startsWith('CSSSupportsRule:')) return CSS.supports(c.slice(16))
                return true
              })
              rules.push({ raw: block, parsed, conditions, conditionsHold, valid, dropped: sheet.cssRules.length === 0 })
            }
          }
        }
        out[name] = {
          classes,
          // False inside a streamed Suspense boundary that JavaScript has not revealed.
          rendered: el.getClientRects().length > 0,
          attrs: { style: el.getAttribute('style'), 'data-token': el.getAttribute('data-token'), css: el.getAttribute('css') },
          rules,
          computed: { vp1280: computed },
        }
      }
      return out
    },
    { props: PROPS, withRules },
  )
}

// ── main ─────────────────────────────────────────────────────────────────
const [command, label, arg, ...rest] = process.argv.slice(2)
if (command === 'prepare') prepare(label, arg)
else if (command === 'build') build(label, arg)
else if (command === 'collect') await collect(label, arg)
else if (command === 'pack') pack(label)
else if (command === 'all') {
  prepare(label, arg)
  for (const config of rest.length ? rest : Object.keys(CONFIGS)) {
    build(label, config)
    await collect(label, config)
  }
} else {
  console.error('usage: node run.mjs prepare|build|collect|all …')
  process.exit(2)
}
