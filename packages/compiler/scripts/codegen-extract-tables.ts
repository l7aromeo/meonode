#!/usr/bin/env bun
/**
 * Codegen: the tables CSS extraction reads from @meonode/ui and Emotion, so the
 * plugin writes exactly what the runtime would without a hand-kept copy.
 *
 * Emits crates/meonode-swc-plugin/src/extract_tables.rs:
 * - `HOST_FACTORIES`: the @meonode/ui factories (and their aliases) declared
 *   as a bare `createNode('tag')` / `createChildrenFirstNode('tag')`.
 * - `UNITLESS`: `@emotion/unitless`'s keys, which decide where Emotion appends
 *   `px` to a number.
 * - `LAYOUT_FACTORIES`: the @meonode/ui factories declared with initial props
 *   (`Row`, `Center`, `Absolute`, …), with those props and their fingerprint,
 *   read by calling the factory: its node's props are
 *   \`combineFactoryProps(initial, undefined)\`. A factory whose initial props
 *   are not flat strings and numbers is left out.
 *
 * Also writes the fixtures the Rust tests compare against, produced by running
 * the runtime's own code:
 * - tests/fixture/extract/prefixer.json: Emotion's vendor prefixer
 *   (`@meonode/ui`'s copy, `src/util/emotion-prefixer.util.ts`) run on every
 *   CSS property against sample values;
 * - tests/fixture/extract/defaults.json: `ThemeUtil.resolveDefaultStyle` on
 *   combinations of the values it decides on;
 * - tests/fixture/extract/style-names.json: `hashStyles` from
 *   `src/util/style-name.util.ts` on sample texts;
 * - tests/fixture/extract/factory-merge.json: the props \`createNode\` builds a
 *   node with, for every layout factory against sample call-site props;
 * - tests/fixture/extract/local-factory-merge.json: the props `createNode` and
 *   `createChildrenFirstNode` build a node with, for sample initial props of a
 *   local factory against sample call-site props, objects as ordered entries;
 * - tests/fixture/extract/selectors.json: the rules Emotion writes (through
 *   the runtime's cache plugins) for one declaration under chains of nested
 *   selector and at-rule keys from \`tests/selector-grammar.ts\`.
 *
 * Usage:
 *   bun run scripts/codegen-extract-tables.ts
 *   MEONODE_UI_DIR=/path/to/ui bun run scripts/codegen-extract-tables.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_PATH = join(REPO_ROOT, 'crates/meonode-swc-plugin/src/extract_tables.rs')
const FIXTURE_DIR = join(REPO_ROOT, 'crates/meonode-swc-plugin/tests/fixture/extract')

/** A factory declared with nothing but its tag: `export const Div = createNode('div')`. */
const HOST_LINE_RE = /^export const ([A-Za-z_$][A-Za-z0-9_$]*) = (?:createNode|createChildrenFirstNode)\('([A-Za-z][A-Za-z0-9-]*)'\)$/

/** Any factory declaration, host or not. */
const CREATOR_LINE_RE = /^export const ([A-Za-z_$][A-Za-z0-9_$]*) = (?:createNode|createChildrenFirstNode)\(/

/** A bare alias re-export: `export const Container = Div`. */
const ALIAS_LINE_RE = /^export const ([A-Za-z_$][A-Za-z0-9_$]*) = ([A-Za-z_$][A-Za-z0-9_$]*)$/

/** Values each property is prefixed against; the prefixer's branches read the value's first characters. */
const SAMPLE_VALUES = [
  '0',
  '1',
  '8px',
  'auto',
  'none',
  'inherit',
  'flex',
  'inline-flex',
  'grid',
  'block',
  'sticky',
  'center',
  'flex-start',
  'space-between',
  'stretch',
  'max-content',
  'min-content',
  'fit-content',
  'fill-available',
  'grab',
  'zoom-in',
  'image-set(url(a.png) 1x)',
  'transform 1s',
  'opacity 1s, transform 2s',
  'vertical-rl',
  'horizontal-tb',
  'text',
  'red !important',
  'flex !important',
  'sticky !important',
  '1 1 auto',
  'row wrap',
  // Whitespace stylis drops or collapses.
  ' auto',
  '1px  solid  red ',
  'a , b',
  'calc( 1px + 2px )',
  '"a  b"',
]

/** Properties every sample, whitespace ones included, is kept for whatever the prefixer does. */
const WHITESPACE_PROPERTIES = new Set(['color', 'margin', 'font-family', 'grid-template-columns'])

const STYLE_NAME_SAMPLES = [
  '',
  'a',
  '\u0000padding\u00008px',
  '@media (min-width: 600px)\u0000:hover\u0000color\u0000red',
  'color:š',
  'content:"\u{1F600}"',
  'x'.repeat(55),
  'x'.repeat(56),
  'x'.repeat(64),
  'x'.repeat(200),
]

function hostFactories(uiDir: string): string[] {
  const srcPath = join(uiDir, 'src/components/html.node.ts')
  const text = readFileSync(srcPath, 'utf8')
  const host = new Set<string>()
  const all = new Set<string>()
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    const hostMatch = HOST_LINE_RE.exec(line)
    if (hostMatch) {
      host.add(hostMatch[1])
      all.add(hostMatch[1])
      continue
    }
    const creatorMatch = CREATOR_LINE_RE.exec(line)
    if (creatorMatch) {
      all.add(creatorMatch[1])
      continue
    }
    const aliasMatch = ALIAS_LINE_RE.exec(line)
    if (aliasMatch && all.has(aliasMatch[2])) {
      all.add(aliasMatch[1])
      if (host.has(aliasMatch[2])) host.add(aliasMatch[1])
    }
  }
  if (host.size === 0) throw new Error(`No host factory declarations found in ${srcPath}.`)
  return sortedAscii([...host])
}

function sortedAscii(names: string[]): string[] {
  for (const name of names) {
    if (!/^[\x00-\x7f]*$/.test(name)) throw new Error(`Non-ASCII entry ${JSON.stringify(name)}: JS and Rust sort orders may differ.`)
  }
  return names.sort()
}

async function prefixerCases(uiDir: string): Promise<[string, number, string][]> {
  const { prefixer } = await import(join(uiDir, 'src/util/emotion-prefixer.util.ts'))
  const { compile, serialize, middleware, stringify } = await import(join(uiDir, 'node_modules/stylis/index.js')).catch(() => import('stylis'))
  const { default: CSSPropertySet } = await import(join(uiDir, 'src/constant/css-properties.const.ts'))
  const cases: [string, number, string][] = []
  const kebab = (name: string) => name.replace(/[A-Z]|^ms/g, '-$&').toLowerCase()
  const run = (declaration: string) => serialize(compile(`.x{${declaration}}`), middleware([prefixer, stringify]))
  const plain = (declaration: string) => serialize(compile(`.x{${declaration}}`), stringify)
  for (const property of [...(CSSPropertySet as Set<string>)].map(kebab).sort()) {
    const declarations = SAMPLE_VALUES.map(value => `${property}:${value};`)
    // A property the prefixer touches for some sample keeps every sample, since
    // its branches read the value. One it never touches needs a single case to
    // show that; stylis's whitespace handling is checked on a few properties.
    const touched = declarations.some(d => run(d) !== plain(d))
    const kept = touched || WHITESPACE_PROPERTIES.has(property) ? declarations : [`${property}:8px;`]
    for (const d of kept) cases.push([d, property.length, run(d)])
  }
  return cases
}

/**
 * Chains of nested keys from the selector grammar, and the rules Emotion writes
 * for `color:red` at the end of each, under the class `.N`.
 */
async function selectorCases(uiDir: string): Promise<[string[], string][]> {
  const { prefixer } = await import(join(uiDir, 'src/util/emotion-prefixer.util.ts'))
  const { default: createCache } = await import(join(uiDir, 'node_modules/@emotion/cache/dist/emotion-cache.cjs.js')).catch(() => import('@emotion/cache'))
  const { serializeStyles } = await import(join(uiDir, 'node_modules/@emotion/serialize/dist/emotion-serialize.cjs.js')).catch(() => import('@emotion/serialize'))
  const grammar = await import('../tests/selector-grammar')
  const cache = createCache({ key: 'css', stylisPlugins: [prefixer] })
  const sheet = { insert() {} }
  const chains: string[][] = []
  const keys = new Set<string>()
  for (const s of grammar.simpleSelectors()) for (const key of grammar.placements(s)) keys.add(key)
  for (const key of grammar.nodeInArguments()) keys.add(key)
  for (const key of keys) chains.push([key])
  const steps = ['&:hover', ':hover', '::before', '& > p', '.dark &', '& + &', '&, ::after', ':not(&)', '& .b, & .c', '[data-x="a,b"] &']
  for (const a of steps) for (const b of steps) chains.push([a, b])
  for (const a of steps.slice(0, 5)) for (const b of steps) for (const c of steps.slice(0, 4)) chains.push([a, b, c])
  const atRules = [...grammar.AT_RULES, '@media  (min-width:  1px)', '@media(min-width:1px)', '@media screen,print', '@supports not (display: grid)', '@media screen and (min-width: 1px) and (max-width: 2px)']
  for (const at of atRules) {
    chains.push([at])
    for (const step of steps) chains.push([at, step], [step, at], [step, at, '&:focus'], [at, atRules[0], step])
  }
  for (const key of ['& > p', '.dark &', '&:hover, &:focus', ':is(&, .a) p', '& + &', '&  ~  .b', ':hover']) for (const ws of grammar.WHITESPACE) chains.push([ws(key)])
  // Parentheses after no colon, and an escaped comma, which compat splits
  // only in rules it composes again.
  for (const key of ['p(&)', 'a\\,b, c', '.a\\,b &']) chains.push([key], [':hover', key], ['&:hover', key])
  // Empty list items, an escape whose space is followed by more whitespace,
  // and quotes outside brackets and parentheses.
  for (const key of [',a', 'a,,b', '&,', '.\\31  a', '.\\31   a', '.\\31  ,a', '.\\31 a', '& "a, b"', "& 'a&b'"]) chains.push([key], ['&:hover', key])
  // A parent rule holding `$` patterns, which stylis's String.prototype.replace
  // reads when it puts the parent in place of `&`.
  for (const parent of ["&[title='$']", '&[title="$&"]', '&[title="$$"]', '&[title="$`"]', '&[title="$1"]']) chains.push([parent, '.x &'], [parent, '&:focus'])
  const out: [string[], string][] = []
  for (const chain of chains) {
    let css: Record<string, unknown> = { color: 'red' }
    for (const key of [...chain].reverse()) css = { [key]: css }
    out.push([chain, cache.insert('.N', serializeStyles([css], cache.registered), sheet, false) as string])
  }
  return out
}

async function styleNames(uiDir: string): Promise<[string, string][]> {
  const { hashStyles } = await import(join(uiDir, 'src/util/style-name.util.ts'))
  return STYLE_NAME_SAMPLES.map(text => [text, hashStyles(text)])
}

/** Values `resolveDefaultStyle` decides on, per key it reads. */
const DEFAULT_SAMPLES: Record<string, unknown[]> = {
  display: [undefined, 'flex', 'inline-flex', 'block', 'grid'],
  overflow: [undefined, 'auto', ''],
  overflowY: [undefined, 'scroll'],
  flexDirection: [undefined, 'row', 'column', 'row-reverse', 'column-reverse'],
  flexWrap: [undefined, 'wrap', 'nowrap', 'wrap-reverse'],
  flexFlow: [undefined, 'row wrap', 'column'],
  flex: [undefined, 1, 0, -1, '1', 'none', 'auto', 'initial', '1 0 auto', '2 3', '1 1 0', '1 1 2', 'auto 2 3', 'calc(1px + 2px)', '1px', 'x', ''],
  flexShrink: [undefined, 0, 2],
  minHeight: [undefined, 40],
  minWidth: [undefined, 0],
}

/** `resolveDefaultStyle`'s output on combinations of the samples, keyed by the defaulted keys. */
async function defaultCases(uiDir: string): Promise<[Record<string, unknown>, Record<string, unknown>][]> {
  const { ThemeUtil } = await import(join(uiDir, 'src/util/theme.util.ts'))
  const keys = Object.keys(DEFAULT_SAMPLES)
  const cases: [Record<string, unknown>, Record<string, unknown>][] = []
  // Every key alone, then pairs of the layout-deciding keys, so each branch is reached.
  const objects: Record<string, unknown>[] = []
  for (const key of keys) for (const value of DEFAULT_SAMPLES[key]) objects.push({ [key]: value })
  const deciding = ['display', 'overflow', 'flexDirection', 'flexWrap', 'flexFlow', 'flex', 'flexShrink']
  for (const a of deciding) for (const b of deciding) {
    if (a >= b) continue
    for (const va of DEFAULT_SAMPLES[a]) for (const vb of DEFAULT_SAMPLES[b]) objects.push({ display: 'flex', [a]: va, [b]: vb })
  }
  for (const input of objects) {
    const out = ThemeUtil.resolveDefaultStyle({ ...input }) as Record<string, unknown>
    const defaults: Record<string, unknown> = {}
    for (const key of ['flexShrink', 'minHeight', 'minWidth']) {
      if (out[key] !== undefined && !(key in input)) defaults[key] = out[key]
    }
    // JSON has no `undefined`: a key present with it is written as null.
    const written: Record<string, unknown> = {}
    for (const key of Object.keys(input)) written[key] = input[key] === undefined ? null : input[key]
    cases.push([written, defaults])
  }
  return cases
}

async function unitlessKeys(uiDir: string): Promise<string[]> {
  const mod = await import(join(uiDir, 'node_modules/@emotion/unitless/dist/emotion-unitless.esm.js')).catch(() => import('@emotion/unitless'))
  const table = (mod.default ?? mod) as Record<string, number>
  return sortedAscii(Object.keys(table).filter(key => table[key] === 1))
}

/** A value written into a JSON fixture; `undefined`, which JSON cannot hold, as a marker object. */
const UNDEFINED_MARKER = { $undefined: true }

function toFixtureJson(value: unknown): unknown {
  if (value === undefined) return UNDEFINED_MARKER
  if (Array.isArray(value)) return value.map(toFixtureJson)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toFixtureJson(v)]))
  }
  return value
}

type Factory = ((...args: unknown[]) => { rawProps: Record<string, unknown> }) & { element: unknown }

/** A layout factory's initial props, as `[key, value]` in the order it declares them, and their fingerprint. */
interface LayoutFactory {
  name: string
  entries: [string, string | number][]
  fingerprint: string
}

/** A factory's node props for `props`, without the `children` a children-first factory adds. */
function nodeProps(factory: Factory, childrenFirst: boolean, props: Record<string, unknown> | undefined): Record<string, unknown> {
  const { children: _children, ...rest } = (childrenFirst ? factory(undefined, props) : factory(props)).rawProps
  return rest
}

/**
 * The fingerprint the runtime compares on a call site whose initial props the
 * compiler merged, as the ui's `initialPropsFingerprint` writes it: a map of
 * `k<len>:<key>` and its value per entry, in JavaScript's key order, a string as
 * `s<len>:<text>` and a number as `n<String(n)>;`, lengths in UTF-16 code units.
 * The compiler's Rust writes the same text (`fingerprint.rs`), and the ui's own
 * function is checked against this one wherever the ui exports it.
 */
function fingerprint(entries: [string, string | number][]): string {
  const ordered = Object.keys(Object.fromEntries(entries))
  const values = new Map(entries)
  return `{${ordered
    .map(key => {
      const value = values.get(key)!
      return `k${key.length}:${key}${typeof value === 'string' ? `s${value.length}:${value}` : `n${String(value)};`}`
    })
    .join('')}}`
}

/** Factories with initial props the compiler does not merge, for the log. */
const skippedLayoutFactories: string[] = []

/**
 * The layout factories, by name. Merged only when every initial prop is a flat
 * entry with a string or finite number value, none of them `css`: the values the
 * table's `InitialValue` holds.
 */
async function layoutFactories(uiDir: string, host: Set<string>): Promise<LayoutFactory[]> {
  const html = (await import(join(uiDir, 'src/components/html.node.ts'))) as Record<string, unknown>
  // The runtime's own fingerprint decides, where the ui has one: a factory it
  // gives none never skips the merge, so it is not merged here either.
  const core = (await import(join(uiDir, 'src/core.node.ts'))) as {
    initialPropsFingerprint?: (initial: Record<string, unknown>) => string | undefined
  }
  const source = readFileSync(join(uiDir, 'src/components/html.node.ts'), 'utf8')
  const out: LayoutFactory[] = []
  for (const name of sortedAscii(Object.keys(html))) {
    const factory = html[name] as Factory
    if (typeof factory !== 'function' || !('element' in factory) || host.has(name)) continue
    const childrenFirst = new RegExp(`^export const ${name} = createChildrenFirstNode\\(`, 'm').test(source)
    const initial = nodeProps(factory, childrenFirst, undefined)
    const entries = Object.entries(initial)
    if (entries.length === 0) continue
    const flat = entries.every(
      ([key, value]) =>
        key !== 'css' &&
        (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))),
    )
    if (childrenFirst || !flat) {
      skippedLayoutFactories.push(name)
      continue
    }
    const typed = entries as [string, string | number][]
    const local = fingerprint(typed)
    const runtime = core.initialPropsFingerprint?.(initial) ?? (core.initialPropsFingerprint ? undefined : local)
    if (runtime === undefined) {
      skippedLayoutFactories.push(name)
      continue
    }
    if (runtime !== local) throw new Error(`${name}: the runtime fingerprints its initial props as ${JSON.stringify(runtime)}, not ${JSON.stringify(local)}.`)
    out.push({ name, entries: typed, fingerprint: runtime })
  }
  return out
}

/** Call-site props each layout factory is merged with in the fixture. */
const FACTORY_CALL_SAMPLES: (Record<string, unknown> | undefined)[] = [
  undefined,
  {},
  { padding: 8 },
  { display: 'grid' },
  { display: undefined },
  { flexDirection: 'row', display: 'block', gap: 4 },
  { position: 'relative', top: 0 },
  { minHeight: 40, minWidth: undefined },
  { alignItems: 'start', justifyContent: undefined, color: 'red' },
  { css: { color: 'red' } },
  { css: { display: 'grid', '&:hover': { color: 'blue' } } },
  { css: false },
  { css: null },
  { css: undefined },
  { css: { '&:hover': { background: 'red', color: undefined } }, padding: 2 },
  { css: ['a{}'] },
  { css: 'color: red;' },
]

/** `[factory, call-site props, the node's props]` per layout factory and sample, from `createNode` itself. */
async function factoryMergeCases(uiDir: string, layout: LayoutFactory[]): Promise<[string, unknown, unknown][]> {
  const html = (await import(join(uiDir, 'src/components/html.node.ts'))) as Record<string, unknown>
  const cases: [string, unknown, unknown][] = []
  for (const { name } of layout) {
    for (const props of FACTORY_CALL_SAMPLES) {
      // Entry lists, not objects: the order is what is checked.
      const toEntries = (o: Record<string, unknown> | undefined) => (o === undefined ? null : Object.entries(o).map(([k, v]) => [k, toFixtureJson(v)]))
      cases.push([name, toEntries(props), toEntries(nodeProps(html[name] as Factory, false, props))])
    }
  }
  return cases
}

/** A value for the local merge fixture: an object as its ordered entries, since serde reads JSON objects unordered. */
function toOrderedJson(value: unknown): unknown {
  if (value === undefined) return UNDEFINED_MARKER
  if (Array.isArray(value)) return value.map(toOrderedJson)
  if (value !== null && typeof value === 'object') return { $entries: Object.entries(value).map(([k, v]) => [k, toOrderedJson(v)]) }
  return value
}

/** Initial props of the local factories in the merge fixture: flat, `css`, DOM and special props, and their mixes. */
const LOCAL_INITIAL_SAMPLES: Record<string, unknown>[] = [
  {},
  { padding: 4 },
  { padding: 4, color: 'red' },
  { css: { color: 'red' } },
  { css: { '&:hover': { color: 'red', background: 'blue' }, '@media (min-width: 1px)': { padding: 1 } } },
  { padding: 4, css: { padding: 8 } },
  { color: 'red', 'data-x': 'a', id: 'i' },
  { className: 'a' },
  { css: { color: 'red' }, padding: 2, title: 't' },
  { flexShrink: 1, minHeight: 0 },
  { children: 'x', padding: 1 },
  { 2: 'two', b: 1, 1: 'one' },
]

/** Call-site props each local factory is merged with in the fixture. */
const LOCAL_CALL_SAMPLES: (Record<string, unknown> | undefined)[] = [
  undefined,
  {},
  { padding: 8 },
  { color: undefined },
  { padding: 8, color: 'blue' },
  { css: { color: 'blue' } },
  { css: { '&:hover': { color: undefined } } },
  { css: { '&:hover': { color: 'green' }, margin: 1 } },
  { css: undefined },
  { css: false },
  { css: null },
  { css: 'color: red;' },
  { css: ['x'] },
  { className: 'b' },
  { className: undefined },
  { className: '' },
  { 'data-x': 'b', id: undefined },
  { children: 'y' },
  { padding: 8, css: { padding: 2 } },
  { 1: 'uno', a: 0 },
]

/** Whether `createNode` composes the two `css` values as `[factoryCss, callSiteCss]` rather than merging them key by key. */
function composesCss(initial: Record<string, unknown>, props: Record<string, unknown> | undefined): boolean {
  const styles = (css: unknown) => css != null && typeof css !== 'boolean'
  const plain = (css: unknown) => css !== null && typeof css === 'object' && !Array.isArray(css)
  const [a, b] = [initial.css, props?.css]
  return styles(a) && styles(b) && !(plain(a) && plain(b))
}

/**
 * `[initial props, call-site props, children-first, the node's props or null]`
 * for each local factory sample, from `createNode` and `createChildrenFirstNode`
 * themselves. `null` where the two `css` values compose, which the compiler
 * leaves to the runtime. Objects are ordered entry lists.
 */
async function localMergeCases(uiDir: string): Promise<unknown[]> {
  const core = (await import(join(uiDir, 'src/core.node.ts'))) as Record<string, (element: string, initial: unknown) => Factory>
  const cases: unknown[] = []
  for (const childrenFirst of [false, true]) {
    const create = childrenFirst ? core.createChildrenFirstNode : core.createNode
    for (const initial of LOCAL_INITIAL_SAMPLES)
      for (const props of LOCAL_CALL_SAMPLES) {
        const merged = composesCss(initial, props) ? null : toOrderedJson(nodeProps(create('div', initial), childrenFirst, props))
        cases.push([toOrderedJson(initial), props === undefined ? null : toOrderedJson(props), childrenFirst, merged])
      }
  }
  return cases
}

function renderRust(host: string[], unitless: string[], layout: LayoutFactory[]): string {
  const list = (names: string[]) => names.map(name => `    ${JSON.stringify(name)},`).join('\n')
  return `// @generated by scripts/codegen-extract-tables.ts — do not edit.
// Sources: @meonode/ui src/components/html.node.ts, @emotion/unitless.
//
// Every table is sorted in byte order, identical to JavaScript's default sort
// for these pure-ASCII names, so lookups use \`binary_search\`.

/// @meonode/ui factories (and aliases of them) declared with nothing but a tag:
/// no initial props merge in at runtime.
pub static HOST_FACTORIES: &[&str] = &[
${list(host)}
];

/// A layout factory's initial value.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum InitialValue {
    Str(&'static str),
    Num(f64),
}

/// A layout factory's initial props, in declaration order.
pub type InitialProps = &'static [(&'static str, InitialValue)];

/// @meonode/ui factories declared with initial props: the name, the
/// fingerprint the runtime compares before it skips its own merge, and the
/// props in declaration order, as \`createNode\` merges them in front of a
/// call site's.
#[rustfmt::skip]
pub static LAYOUT_FACTORIES: &[(&str, &str, InitialProps)] = &[
${layout.map(({ name, fingerprint, entries }) => `    (${JSON.stringify(name)}, ${JSON.stringify(fingerprint)}, &[${entries.map(([k, v]) => `(${JSON.stringify(k)}, InitialValue::${typeof v === 'number' ? `Num(${Number.isInteger(v) ? v.toFixed(1) : String(v)})` : `Str(${JSON.stringify(v)})`})`).join(', ')}]),`).join('\n')}
];

/// \`@emotion/unitless\`'s keys: properties Emotion writes a number to as it is.
/// Keyed as authored, in camelCase, which is how Emotion looks them up.
pub static UNITLESS: &[&str] = &[
${list(unitless)}
];

/// The fingerprint and initial props of the layout factory \`name\`.
pub fn layout_factory(name: &str) -> Option<(&'static str, InitialProps)> {
    LAYOUT_FACTORIES
        .binary_search_by(|(key, _, _)| (*key).cmp(name))
        .ok()
        .map(|at| (LAYOUT_FACTORIES[at].1, LAYOUT_FACTORIES[at].2))
}

/// Whether \`name\` is an extractable host factory.
pub fn is_host_factory(name: &str) -> bool {
    HOST_FACTORIES.binary_search(&name).is_ok()
}

/// Whether Emotion writes a number against the key \`key\`, as authored, without \`px\`.
pub fn is_unitless(key: &str) -> bool {
    UNITLESS.binary_search(&key).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tables_are_sorted() {
        assert!(HOST_FACTORIES.windows(2).all(|w| w[0] < w[1]));
        assert!(UNITLESS.windows(2).all(|w| w[0] < w[1]));
        assert!(LAYOUT_FACTORIES.windows(2).all(|w| w[0].0 < w[1].0));
    }

    #[test]
    fn host_factories_exclude_factories_with_initial_props() {
        assert!(is_host_factory("Div"));
        assert!(is_host_factory("Span"));
        assert!(!is_host_factory("Row"));
        assert!(!is_host_factory("Center"));
        assert!(!is_host_factory("Absolute"));
    }

    #[test]
    fn unitless_is_keyed_as_emotion_keys_it() {
        assert!(is_unitless("lineHeight"));
        assert!(is_unitless("zIndex"));
        assert!(!is_unitless("line-height"));
        assert!(!is_unitless("width"));
    }
}
`
}

async function main() {
  const uiDir = resolve(REPO_ROOT, process.env.MEONODE_UI_DIR ?? '../ui')
  const host = hostFactories(uiDir)
  const unitless = await unitlessKeys(uiDir)
  const layout = await layoutFactories(uiDir, new Set(host))
  mkdirSync(dirname(OUT_PATH), { recursive: true })
  writeFileSync(OUT_PATH, renderRust(host, unitless, layout), 'utf8')

  mkdirSync(FIXTURE_DIR, { recursive: true })
  const prefixer = await prefixerCases(uiDir)
  writeFileSync(join(FIXTURE_DIR, 'prefixer.json'), '[\n' + prefixer.map(c => JSON.stringify(c)).join(',\n') + '\n]\n', 'utf8')
  const defaults = await defaultCases(uiDir)
  writeFileSync(join(FIXTURE_DIR, 'defaults.json'), '[\n' + defaults.map(c => JSON.stringify(c)).join(',\n') + '\n]\n', 'utf8')
  const merges = await factoryMergeCases(uiDir, layout)
  writeFileSync(join(FIXTURE_DIR, 'factory-merge.json'), '[\n' + merges.map(c => JSON.stringify(c)).join(',\n') + '\n]\n', 'utf8')
  const localMerges = await localMergeCases(uiDir)
  writeFileSync(join(FIXTURE_DIR, 'local-factory-merge.json'), '[\n' + localMerges.map(c => JSON.stringify(c)).join(',\n') + '\n]\n', 'utf8')
  const selectors = await selectorCases(uiDir)
  writeFileSync(join(FIXTURE_DIR, 'selectors.json'), '[\n' + selectors.map(c => JSON.stringify(c)).join(',\n') + '\n]\n', 'utf8')
  const names = await styleNames(uiDir)
  writeFileSync(join(FIXTURE_DIR, 'style-names.json'), '[\n' + names.map(c => JSON.stringify(c)).join(',\n') + '\n]\n', 'utf8')

  console.log(
    `Wrote ${host.length} host factories, ${layout.length} layout factories${skippedLayoutFactories.length ? ` (skipped: ${skippedLayoutFactories.join(', ')})` : ''}, ${merges.length} factory merges, ${localMerges.length} local factory merges, ${unitless.length} unitless keys, ${prefixer.length} prefixer cases, ${selectors.length} selector chains, ${names.length} style names`,
  )
}

await main()
