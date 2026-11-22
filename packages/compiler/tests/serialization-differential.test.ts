// The serialization differential: for every grammar case, the class name and
// serialized styles the compiler writes at build time must equal the ones the
// runtime computes for the same call site compiled without extraction. That
// is the name `renderOwnClass` gives the node (`hashStyles` of Emotion's
// `serializeStyles` text) and the text it registers under it, so a compiled
// node is the rule Emotion would insert for it, under the same name.
//
// The runtime side is read from Emotion's cache during a server render: every
// insertion hands `cache.insert` the serialized styles under their name. The
// compiled side is read without rendering, from the module's registrations and
// each call site's props, so the check depends on the compiler alone.
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import createEmotionCache, { type EmotionCache } from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { transform } from '@swc/core'
import { createElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { type Case, type Css, cases, PROPS } from './selector-grammar'

/** The compiler under test: `MEONODE_DIFFERENTIAL_WASM`, or the package's own build. */
const WASM_PATH = path.resolve(process.env.MEONODE_DIFFERENTIAL_WASM ?? path.resolve(import.meta.dirname, '../npm/meonode_swc_plugin.wasm'))
const TMP_DIR = path.resolve(import.meta.dirname, '.tmp')
/** `MEONODE_DIFFERENTIAL_FILTER`: a regular expression; only cases whose name matches run. */
const FILTER = process.env.MEONODE_DIFFERENTIAL_FILTER ? new RegExp(process.env.MEONODE_DIFFERENTIAL_FILTER) : null
if (!existsSync(WASM_PATH)) throw new Error(`wasm artifact not found at ${WASM_PATH}; run \`bun run build:wasm\` first`)

/** Attribute naming the case on its node. */
const CASE_ATTRIBUTE = 'data-case'
/** The Emotion cache key the reference renders under; the runtime prefixes names with it. */
const CACHE_KEY = 'css'
/** Call-site key holding a node's class name. */
const NAME_KEY = '__meo$n'
/** Call-site key holding a template node's id and holes. */
const TEMPLATE_KEY = '__meo$t'

/** `css` as JavaScript source. */
function source(css: Css): string {
  const entries = Object.entries(css).map(
    ([key, value]) => `${JSON.stringify(key)}: ${value === null ? 'null' : typeof value === 'string' ? value : source(value)}`,
  )
  return `{ ${entries.join(', ')} }`
}

/** One call site under test: `call` is factory-call source in which `ATTR` stands for the case's attribute. */
interface Call {
  name: string
  call: string
}

/** The grammar's cases as calls: the node, and its pair as a child. */
function grammarCalls(all: Case[]): Call[] {
  return all.map(c => {
    const child = c.pair ? `, children: Div({ ATTR_PAIR, css: ${source(c.pair)} })` : ''
    return { name: c.name, call: `Div({ ATTR, css: ${source(c.css)}${child} })` }
  })
}

/**
 * What the serialization reads beyond selectors: values Emotion writes or
 * skips by type, labels, top-level props beside `css`, layout factories'
 * initial props, the layout `resolveDefaultStyle` reads, and SWITCH choices
 * up to and past the cap.
 */
const SERIAL_CALLS: readonly Call[] = [
  { name: 'null value', call: `Div({ ATTR, css: { color: null, padding: 4 } })` },
  { name: 'nested null', call: `Div({ ATTR, css: { '&:hover': { color: null } } })` },
  { name: 'booleans', call: `Div({ ATTR, css: { color: true, padding: false, margin: 2 } })` },
  { name: 'empty string', call: `Div({ ATTR, css: { color: '' } })` },
  { name: 'undefined', call: `Div({ ATTR, css: { color: undefined, margin: 1 } })` },
  { name: 'label', call: `Div({ ATTR, css: { label: 'card', color: 'red' } })` },
  { name: 'nested label', call: `Div({ ATTR, css: { '&:hover': { label: 'hov', color: 'red' } } })` },
  { name: 'two labels', call: `Div({ ATTR, css: { label: 'a', '&:hover': { label: 'b' } } })` },
  { name: 'label in a value', call: `Div({ ATTR, css: { content: '"label:x;"' } })` },
  { name: 'label with a space', call: `Div({ ATTR, css: { label: 'a b' } })` },
  { name: 'top-level props', call: `Div({ ATTR, color: 'red', padding: 8, css: { padding: 4, margin: 2 } })` },
  { name: 'top-level null before a primitive', call: `Div({ ATTR, padding: null, color: 'red' })` },
  { name: 'Row', call: `Row({ ATTR, gap: 4 })` },
  { name: 'Row overridden', call: `Row({ ATTR, flexDirection: 'column', css: { display: 'grid' } })` },
  { name: 'Column', call: `Column({ ATTR, display: 'grid' })` },
  { name: 'Center', call: `Center({ ATTR, css: { flexDirection: 'row' } })` },
  { name: 'Grid', call: `Grid({ ATTR })` },
  { name: 'flex container', call: `Div({ ATTR, display: 'flex' })` },
  { name: 'inline-flex column', call: `Div({ ATTR, display: 'inline-flex', flexDirection: 'column' })` },
  { name: 'column-reverse', call: `Div({ ATTR, display: 'flex', flexDirection: 'column-reverse' })` },
  { name: 'wrap', call: `Div({ ATTR, display: 'flex', flexWrap: 'wrap' })` },
  { name: 'wrap-reverse', call: `Div({ ATTR, display: 'flex', flexWrap: 'wrap-reverse' })` },
  { name: 'flexFlow wrap', call: `Div({ ATTR, display: 'flex', flexFlow: 'row wrap' })` },
  { name: 'overflow', call: `Div({ ATTR, display: 'flex', overflow: 'auto' })` },
  { name: 'overflowX', call: `Div({ ATTR, display: 'flex', overflowX: 'hidden' })` },
  { name: 'overflow true', call: `Div({ ATTR, display: 'flex', overflow: true })` },
  { name: 'flex 1', call: `Div({ ATTR, flex: 1 })` },
  { name: 'flex string', call: `Div({ ATTR, flex: '1 0 auto' })` },
  { name: 'flex none', call: `Div({ ATTR, flex: 'none' })` },
  { name: 'flex auto', call: `Div({ ATTR, flex: 'auto' })` },
  { name: 'flex empty', call: `Div({ ATTR, flex: '' })` },
  { name: 'flex unparsed', call: `Div({ ATTR, flex: 'a b c d' })` },
  { name: 'flex in css', call: `Div({ ATTR, color: 'red', css: { flex: '2 3' } })` },
  { name: 'flexShrink', call: `Div({ ATTR, flexShrink: 2 })` },
  { name: 'flexShrink null', call: `Div({ ATTR, flexShrink: null })` },
  { name: 'flexShrink undefined', call: `Div({ ATTR, flexShrink: undefined, color: 'red' })` },
  { name: 'minHeight', call: `Div({ ATTR, minHeight: 'auto' })` },
  { name: 'numbers', call: `Div({ ATTR, css: { margin: 0, top: -4, left: 1.5, lineHeight: 1.5, opacity: 0.5, zIndex: 3, '--x': 4 } })` },
  { name: 'vendor keys', call: `Div({ ATTR, css: { msTransform: 'none', WebkitTransition: 'none', MozAppearance: 'none' } })` },
  { name: 'empty nested', call: `Div({ ATTR, css: { '&:hover': {} } })` },
  { name: 'theme tokens', call: `Div({ ATTR, color: 'theme.primary', padding: 'theme.spacing.md' })` },
  { name: 'animation', call: `Div({ ATTR, css: { animation: 'spin 1s linear' } })` },
  { name: 'important', call: `Div({ ATTR, color: 'red !important' })` },
  { name: 'switch', call: `Div({ ATTR, color: p.on ? 'red' : 'blue' })` },
  { name: 'switch in defaults', call: `Div({ ATTR, display: p.on ? 'flex' : 'block' })` },
  { name: 'switch nested', call: `Div({ ATTR, css: { '&:hover': { color: p.on ? 'red' : undefined } } })` },
  { name: 'switch and', call: `Div({ ATTR, css: { color: p.on && 'red' } })` },
  { name: 'switch chain', call: `Div({ ATTR, color: p.on ? 'red' : p.n > 4 ? 'blue' : 'green' })` },
  { name: 'switch pair', call: `Div({ ATTR, color: p.on ? 'red' : 'blue', margin: p.on ? 1 : 2 })` },
  {
    name: 'switches past the cap',
    call: `Div({ ATTR, color: p.on ? 'a' : 'b', margin: p.on ? 1 : 2, padding: p.on ? 1 : 2, top: p.on ? 1 : 2, left: p.on ? 1 : 2 })`,
  },
]

/** A module whose `cases[i](p)` makes call `i`'s node. */
function moduleOf(calls: readonly Call[]): string {
  const lines = calls.map(
    (c, i) =>
      `  (p) => ${c.call.replace('ATTR_PAIR', `${JSON.stringify(CASE_ATTRIBUTE)}: "${i}-pair"`).replace('ATTR', `${JSON.stringify(CASE_ATTRIBUTE)}: "${i}"`)},`,
  )
  return `import { Center, Column, Div, Grid, Row } from '@meonode/ui'\nexport const cases = [\n${lines.join('\n')}\n]\n`
}

async function compile(code: string, file: string, extract: boolean): Promise<string> {
  const plugin = extract ? { experimental_extractCss: true } : {}
  return (
    await transform(code, {
      filename: path.join(TMP_DIR, file),
      jsc: { target: 'es2022', parser: { syntax: 'ecmascript' }, experimental: { plugins: [[WASM_PATH, plugin]] } },
    })
  ).code
}

async function load<T>(code: string, name: string): Promise<T> {
  await mkdir(TMP_DIR, { recursive: true })
  const file = path.join(TMP_DIR, `${name}.mjs`)
  await writeFile(file, code, 'utf8')
  return (await import(pathToFileURL(file).href)) as T
}

/** A node's name and serialized styles. */
interface Styled {
  name: string
  styles: string
}

/** Each case node's name and styles, as the runtime gives them: `id` → styled, or absent when unstyled. */
function runtimeStyles(node: { render(): ReactNode }): Map<string, Styled> {
  const cache: EmotionCache = createEmotionCache({ key: CACHE_KEY })
  // Emotion hands every insertion the serialized styles under their name.
  const serializedByName = new Map<string, string>()
  const insert = cache.insert.bind(cache)
  cache.insert = (selector, serialized, sheet, shouldCache) => {
    serializedByName.set(serialized.name, serialized.styles)
    return insert(selector, serialized, sheet, shouldCache)
  }
  const html = renderToString(createElement(CacheProvider, { value: cache }, node.render()))
  const out = new Map<string, Styled>()
  for (const tag of html.matchAll(/<[a-z]+\s[^>]*>/g)) {
    const id = tag[0].match(new RegExp(`${CASE_ATTRIBUTE}="([^"]*)"`))?.[1]
    if (id === undefined) continue
    const own = (tag[0].match(/\sclass="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(c => c.startsWith(`${CACHE_KEY}-`))
    if (own.length !== 1) continue
    const name = own[0].slice(CACHE_KEY.length + 1)
    const styles = serializedByName.get(name) ?? cache.registered[own[0]]
    if (styles === undefined) throw new Error(`class ${own[0]} on case ${id} was never inserted`)
    out.set(id, { name, styles })
  }
  return out
}

/** What the compiled module registered, and how each call site names itself. */
interface CompiledModule {
  cases: ((p: unknown) => CallRecord)[]
  registered: Map<string, string>
  templates: Map<string, string[]>
}

/** A stand-in for a host factory: the props it was called with. */
interface CallRecord {
  props: Record<string, unknown>
}

/** `@meonode/ui` as the compiled module sees it, recording instead of rendering. */
const RECORDER_SOURCE = `
export const registered = new Map()
export const templates = new Map()
export function registerStaticCss(_moduleId, entries) {
  for (const entry of entries) {
    // Only the per-node shape \`[name, styles]\` is read.
    if (entry.length !== 2) continue
    const [name, styles] = entry
    const known = registered.get(name)
    if (known !== undefined && known !== styles) throw new Error('name ' + name + ' registered with two texts')
    registered.set(name, styles)
  }
}
export function registerStaticTemplate(id, chunks) { templates.set(id, chunks) }
export function toCssValue(_key, value) { return String(value) }
export const Div = props => ({ props })
export const Row = Div
export const Column = Div
export const Center = Div
export const Grid = Div
`

/** The compiled call sites' names and styles: `id` → styled, for each case node the compiler named. */
function compiledStyles(module: CompiledModule, record: CallRecord): Map<string, Styled> {
  const out = new Map<string, Styled>()
  const visit = (call: CallRecord) => {
    const props = call.props
    const dom = (props.__meo$d ?? props) as Record<string, unknown>
    const id = String(dom[CASE_ATTRIBUTE] ?? props[CASE_ATTRIBUTE])
    if (typeof props[NAME_KEY] === 'string') {
      const name = props[NAME_KEY] as string
      const styles = module.registered.get(name)
      if (styles === undefined) throw new Error(`case ${id}: name ${name} is not registered`)
      out.set(id, { name, styles })
    } else if (Array.isArray(props[TEMPLATE_KEY])) {
      const [templateId, ...holes] = props[TEMPLATE_KEY] as string[]
      const chunks = module.templates.get(templateId)
      if (chunks === undefined) throw new Error(`case ${id}: template ${templateId} is not registered`)
      out.set(id, { name: '', styles: chunks.map((chunk, i) => chunk + (holes[i] ?? '')).join('') })
    }
    const children = props.children ?? (props.__meo$d as Record<string, unknown> | undefined)?.children
    for (const child of [children].flat()) if (child && typeof child === 'object' && 'props' in child) visit(child as CallRecord)
  }
  visit(record)
  return out
}

describe('serialization differential', () => {
  it('names and serializes every extracted case as the runtime does', { timeout: 600_000 }, async () => {
    const all = [...grammarCalls(cases()), ...SERIAL_CALLS].filter(c => !FILTER || FILTER.test(c.name))
    const written = moduleOf(all)
    const reference = (await load<{ cases: ((p: unknown) => { render(): ReactNode })[] }>(await compile(written, 'serial.off.mjs', false), 'serial.off')).cases
    const recorder = pathToFileURL(path.join(TMP_DIR, 'serial-recorder.mjs')).href
    await load(RECORDER_SOURCE, 'serial-recorder')
    const extractedCode = (await compile(written, 'serial.on.mjs', true)).replaceAll(/from\s+["']@meonode\/ui["']/g, `from ${JSON.stringify(recorder)}`)
    const compiledModule = await load<{ cases: CompiledModule['cases'] }>(extractedCode, 'serial.on')
    const recorderModule = await import(recorder)
    const module: CompiledModule = { cases: compiledModule.cases, registered: recorderModule.registered, templates: recorderModule.templates }

    const mismatches: string[] = []
    let extracted = 0
    let styled = 0
    const routes: string[] = []
    for (const [index, c] of all.entries()) {
      for (const props of PROPS) {
        const want = runtimeStyles(reference[index](props))
        styled += want.size
        const got = compiledStyles(module, module.cases[index](props))
        if (props === PROPS[0]) routes.push(`${got.has(String(index)) ? 'named' : 'runtime'}\t${c.name}`)
        for (const [id, styled] of got) {
          extracted++
          const expected = want.get(id)
          if (expected === undefined) mismatches.push(`${c.name} [${id}]: compiled names ${styled.name}, the runtime gives no class`)
          else if (expected.styles !== styled.styles) mismatches.push(`${c.name} [${id}]: styles\n  runtime  ${expected.styles}\n  compiled ${styled.styles}`)
          else if (styled.name && expected.name !== styled.name) mismatches.push(`${c.name} [${id}]: name ${styled.name}, runtime ${expected.name}`)
        }
      }
    }
    await writeFile(path.join(TMP_DIR, 'serialization-differential.mismatches.txt'), `${all.length} cases, ${styled} runtime-styled nodes, ${extracted} compiled nodes, ${mismatches.length} mismatches\n${mismatches.join('\n')}`, 'utf8')
    await writeFile(path.join(TMP_DIR, 'serialization-differential.routes.txt'), `${routes.join('\n')}\n`, 'utf8')
    // A run that compares nothing passes on any compiler.
    expect(styled, 'runtime-styled nodes read').toBeGreaterThan(0)
    expect(extracted, 'compiled nodes compared').toBeGreaterThan(0)
    expect(mismatches.slice(0, 20)).toEqual([])
  })
})
