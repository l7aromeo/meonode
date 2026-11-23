// Writes the selector and at-rule inventories' cases into corpus/generated
// (gitignored) at the start of every run, so they always match selectors.mjs
// and atrules.mjs. Selectors: one node per entry, on the element it needs,
// wrapped beside a sibling span, and marked to have pseudo-classes forced only
// where the entry needs them. At-rules: one node per entry and depth (top of
// the css, inside a selector block, inside another at-rule). The compiler's
// selector grammar: grammar.mjs.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CORPUS } from './build.mjs'
import { ATRULES } from './atrules.mjs'
import { writeGrammarPages } from './grammar.mjs'
import { SELECTORS } from './selectors.mjs'

/** Entries per generated case: enough to keep a record small, few enough cases to keep a run short. */
const PER_CASE = 24
/** The directory the generated cases go to, under the corpus. */
export const GENERATED = 'generated'
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='

/** The element markup for an entry, as source text, with its props (key, css, force mark) spliced in. */
function element(on, props) {
  const p = extra => `{ ${props}${extra ? `, ${extra}` : ''} }`
  switch (on) {
    case 'div':
      return `Div(${p(`className: 'parity', 'data-a': 'x y', lang: 'en-GB', children: [Span('one', { key: 'a' }), Span('two', { key: 'b', id: 'parity-id' })]`)})`
    case 'list':
      return `Ul(${p(`children: [Li({ key: '1', children: 'one' }), Li({ key: '2', children: A({ key: 'a', href: '#parity', children: 'link' }) })]`)})`
    case 'heading':
      return `H2('heading', ${p()})`
    case 'link':
      return `A(${p(`href: '#parity', children: 'link'`)})`
    case 'text':
      return `Input(${p(`placeholder: 'placeholder'`)})`
    case 'empty-text':
      return `Div(${p()})`
    case 'required':
      return `Input(${p('required: true')})`
    case 'checkbox':
      return `Input(${p(`type: 'checkbox'`)})`
    case 'checked':
      return `Input(${p(`type: 'checkbox', defaultChecked: true`)})`
    case 'number':
      return `Input(${p(`type: 'number', min: 0, max: 10, defaultValue: 5`)})`
    case 'out-of-range':
      return `Input(${p(`type: 'number', min: 0, max: 10, defaultValue: 50`)})`
    case 'range':
    case 'color':
    case 'date':
    case 'file':
    case 'password':
    case 'search':
      return `Input(${p(`type: '${on}'`)})`
    case 'select':
      return `Select(${p(`children: [Option('a', { key: 'a' }), Option('b', { key: 'b' })]`)})`
    case 'details':
      return `Details(${p(`open: true, children: [Summary('summary', { key: 's' }), P('content', { key: 'p' })]`)})`
    case 'dialog':
      return `Dialog(${p(`open: true, children: 'dialog'`)})`
    case 'video':
      return `Video(${p('muted: true, width: 40, height: 20')})`
    case 'meter-low':
      return `Meter(${p('min: 0, max: 10, low: 3, high: 7, optimum: 9, value: 1')})`
    case 'meter-optimum':
      return `Meter(${p('min: 0, max: 10, low: 3, high: 7, optimum: 9, value: 9')})`
    case 'progress':
      return `Progress(${p()})`
    case 'image':
      return `Img(${p(`src: '${PIXEL}', alt: ''`)})`
    case 'custom':
      return `Node('parity-el' as never, ${p(`className: 'x', children: Span('slot', { key: 's' })`)} as never)`
    case 'table':
      return `Table(${p(`children: [Colgroup({ key: 'c', children: Col({ key: 'f', className: 'first' }) }), Tbody({ key: 'b', children: Tr({ children: [Td({ key: 'a', children: 'a' }), Td({ key: 'b', children: 'b' })] }) })]`)})`
    case 'popover':
      return `Div(${p(`popover: 'auto', children: 'popover'`)})`
    case 'textarea':
      return `Textarea(${p(`defaultValue: 'text'`)})`
    default:
      throw new Error(`no markup for element ${on}`)
  }
}

/** The declarations an entry sets: a colour and an outline offset, and content where the selector makes a box from it. */
function declarations(name) {
  const content = /before|after|marker/.test(name) ? `content: '"·"', ` : ''
  return `{ ${content}color: 'rgb(200, 0, 0)', outlineOffset: '3px' }`
}

/** The shared header of a generated case: the factories every element markup uses. */
const IMPORTS = `import type { ReactElement } from 'react'
import { A, Col, Colgroup, Details, Dialog, Div, H2, Img, Input, Li, Meter, Node, Option, P, Progress, Select, Span, Summary, Table, Tbody, Td, Textarea, Tr, Ul, Video } from '@meonode/ui'
import type { CaseMeta } from '../../case.js'`

/**
 * The depths an at-rule entry is written at, each as the css object source
 * around the entry's own `key: value`: the top of the node's css, a selector
 * block that always matches the node, and an at-rule that always holds.
 */
const DEPTHS = [
  ['top', rule => rule],
  ['in-selector', rule => `'&:not(.parity-none)': { ${rule} }`],
  ['in-at-rule', rule => `'@media all': { ${rule} }`],
]

/** One generated at-rule case's source. */
function atruleCaseSource(index, nodes) {
  const body = nodes.map(({ entry, depth, wrap }, i) => {
    const key = `a${index}-${i}`
    const rule = wrap(`${JSON.stringify(entry.key)}: ${entry.value}`)
    const props = `key: '${key}', css: { ${rule}${entry.extra ? `, ${entry.extra}` : ''} }`
    const wrapper = [entry.container ? `containerType: 'inline-size'` : '', entry.scope ? `className: 'parity-scope'` : ''].filter(Boolean).join(', ')
    return `      // ${entry.id}, ${depth}\n      Div({ key: '${key}-w', ${wrapper ? `${wrapper}, ` : ''}children: [${element(entry.on ?? 'div', props)}, Span('after', { key: 'after' })] }),`
  })
  return `// Generated by tests/parity/generate.mjs from atrules.mjs: the at-rule
// inventory, nodes ${index * PER_CASE + 1}–${index * PER_CASE + nodes.length}. Do not edit; edit atrules.mjs.
${IMPORTS}

export const meta: CaseMeta = {
  shapes: ['place.css', 'at.nested', 'env.ssr-hydrate'],
  routes: [],
  generatedFrom: 'atrules',
  atrules: ${JSON.stringify([...new Set(nodes.map(n => n.entry.id))])},
  force: 'marked',
}

export function App(): ReactElement {
  return Div({
    children: [
${body.join('\n')}
    ],
  } as never).render() as ReactElement
}
`
}

/** One generated case's source. */
function caseSource(index, entries) {
  const nodes = entries.map((entry, i) => {
    const key = `n${index}-${i}`
    const props = `key: '${key}', css: { ${JSON.stringify(entry.key)}: ${declarations(entry.name)} }${entry.force ? `, 'data-parity-force': ''` : ''}`
    return `      // ${entry.name}\n      Div({ key: '${key}-w', children: [${element(entry.on, props)}, Span('after', { key: 'after' })] }),`
  })
  return `// Generated by tests/parity/generate.mjs from selectors.mjs: the selector
// inventory, entries ${index * PER_CASE + 1}–${index * PER_CASE + entries.length}. Do not edit; edit selectors.mjs.
${IMPORTS}

export const meta: CaseMeta = {
  shapes: ['place.css', 'env.ssr-hydrate'],
  routes: ['NAMED'],
  generatedFrom: 'selectors',
  selectors: ${JSON.stringify(entries.map(e => e.name))},
  force: 'marked',
}

export function App(): ReactElement {
  return Div({
    children: [
${nodes.join('\n')}
    ],
  } as never).render() as ReactElement
}
`
}

/** Writes every generated case, replacing the previous ones, and returns their names. */
export async function writeGeneratedCases() {
  const dir = join(CORPUS, GENERATED)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const names = []
  for (let i = 0; i * PER_CASE < SELECTORS.length; i++) {
    const name = `selectors-${String(i + 1).padStart(2, '0')}`
    writeFileSync(join(dir, `${name}.case.ts`), caseSource(i, SELECTORS.slice(i * PER_CASE, (i + 1) * PER_CASE)))
    names.push(`${GENERATED}/${name}`)
  }
  const nodes = ATRULES.flatMap(entry => DEPTHS.map(([depth, wrap]) => ({ entry, depth, wrap })))
  for (let i = 0; i * PER_CASE < nodes.length; i++) {
    const name = `atrules-${String(i + 1).padStart(2, '0')}`
    writeFileSync(join(dir, `${name}.case.ts`), atruleCaseSource(i, nodes.slice(i * PER_CASE, (i + 1) * PER_CASE)))
    names.push(`${GENERATED}/${name}`)
  }
  for (const name of await writeGrammarPages(dir)) names.push(`${GENERATED}/${name}`)
  return names
}
