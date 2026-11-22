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
import { type Call, CORPUS_CONSTS, corpusCalls, PROPS } from './serialization-corpus'

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
/** The runtime's theme utilities, which the recorder's \`toCssValue\` writes values with. */
const THEME_UTIL = path.resolve(import.meta.dirname, '../../ui/dist/esm/util/theme.util.js')
/** The runtime's naming, which the recorder names joined templates with. */
const STYLE_NAME_UTIL = path.resolve(import.meta.dirname, '../../ui/dist/esm/util/style-name.util.js')
/** Call-site key holding a node's class name. */
const NAME_KEY = '__meo$n'
/** Call-site key holding a template node's id and holes. */
const TEMPLATE_KEY = '__meo$t'

/** A module whose `cases[i](p)` makes call `i`'s node. */
function moduleOf(calls: readonly Call[]): string {
  const lines = calls.map(
    (c, i) =>
      `  (p) => ${c.call.replace('ATTR_PAIR', `${JSON.stringify(CASE_ATTRIBUTE)}: "${i}-pair"`).replace('ATTR', `${JSON.stringify(CASE_ATTRIBUTE)}: "${i}"`)},`,
  )
  const consts = Object.entries(CORPUS_CONSTS).map(([name, value]) => `const ${name} = ${value}\n`).join('')
  return `import { Center, Column, Div, Grid, Row } from '@meonode/ui'\n${consts}export const cases = [\n${lines.join('\n')}\n]\n`
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
  nameTemplate: (text: string) => string
}

/** A stand-in for a host factory: the props it was called with. */
interface CallRecord {
  props: Record<string, unknown>
}

/** `@meonode/ui` as the compiled module sees it, recording instead of rendering. */
const RECORDER_SOURCE = `
import { serializeStyles } from '@emotion/serialize'
import { ThemeUtil } from ${JSON.stringify(pathToFileURL(THEME_UTIL).href)}
import { nameStyles } from ${JSON.stringify(pathToFileURL(STYLE_NAME_UTIL).href)}
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
// The value text the runtime writes for \`value\` under \`key\`: its token
// rewrite and dropped blocks, then Emotion's own serialization of the one
// declaration. The reference renders without a theme, so this resolves without one.
export function toCssValue(key, value) {
  // A hole's text is the value alone; Emotion's keyframes extraction writes
  // outside it, so the writer cannot stand for such a value.
  if ((key === 'animation' || key === 'animationName') && String(value).includes('_EMO_')) throw new Error('toCssValue cannot write keyframes')
  const css = ThemeUtil.dropThemedKeys(ThemeUtil.resolveObjWithTheme({ [key]: value }, undefined, { processFunctions: true, themeStringsMode: 'vars' }), () => {})
  const text = serializeStyles([css]).styles
  return text.slice(text.indexOf(':') + 1, -1)
}
// A template's name as the runtime gives joined text: Emotion's label suffix, MeoNode's hash.
export function nameTemplate(text) { return nameStyles(serializeStyles([text])).name }
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
      if (chunks.length !== holes.length + 1) throw new Error(`case ${id}: template ${templateId} has ${chunks.length} chunks for ${holes.length} holes`)
      const styles = chunks.map((chunk, i) => chunk + (holes[i] ?? '')).join('')
      out.set(id, { name: module.nameTemplate(styles), styles })
    }
    const children = props.children ?? (props.__meo$d as Record<string, unknown> | undefined)?.children
    for (const child of [children].flat()) if (child && typeof child === 'object' && 'props' in child) visit(child as CallRecord)
  }
  visit(record)
  return out
}

describe('serialization differential', () => {
  it('names and serializes every extracted case as the runtime does', { timeout: 600_000 }, async () => {
    const all = corpusCalls().filter(c => !FILTER || FILTER.test(c.name))
    const written = moduleOf(all)
    const reference = (await load<{ cases: ((p: unknown) => { render(): ReactNode })[] }>(await compile(written, 'serial.off.mjs', false), 'serial.off')).cases
    const recorder = pathToFileURL(path.join(TMP_DIR, 'serial-recorder.mjs')).href
    await load(RECORDER_SOURCE, 'serial-recorder')
    const extractedCode = (await compile(written, 'serial.on.mjs', true)).replaceAll(/from\s+["']@meonode\/ui["']/g, `from ${JSON.stringify(recorder)}`)
    const compiledModule = await load<{ cases: CompiledModule['cases'] }>(extractedCode, 'serial.on')
    const recorderModule = await import(recorder)
    const module: CompiledModule = { cases: compiledModule.cases, registered: recorderModule.registered, templates: recorderModule.templates, nameTemplate: recorderModule.nameTemplate }

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
          else if (expected.name !== styled.name) mismatches.push(`${c.name} [${id}]: name ${styled.name}, runtime ${expected.name}`)
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
