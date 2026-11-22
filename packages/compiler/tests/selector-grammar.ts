// Selector shapes a node's `css` can hold, for the selector differential
// (`selector-differential.test.ts`) and the browser parity suite.
//
// The simple selectors come from the CSS specifications' selector index
// (@webref/css `selectors`): every pseudo-class and pseudo-element, each
// functional one with valid arguments, and every combinator. Added to them:
// type, universal, class, id, attribute selectors with every operator and flag,
// namespaces, vendor pseudos, and the pseudos stylis rewrites. `cases()`
// crosses them with where `&` sits, selector lists, nesting, at-rules,
// whitespace, empty and null blocks, long chains, and values that are static,
// read at run time, or chosen by a condition.
import webref from '@webref/css/css.json' with { type: 'json' }

/** A selector index entry: its name (`:hover`, `::part()`, `>`). */
interface IndexEntry {
  name: string
}

/** The selector index. */
export const SELECTOR_INDEX: readonly IndexEntry[] = (webref as { selectors: IndexEntry[] }).selectors

/**
 * Valid arguments for every functional pseudo in the index, by name. A new
 * functional pseudo in the index without an entry here fails the coverage test.
 */
export const FUNCTIONAL_ARGUMENTS: Readonly<Record<string, readonly string[]>> = {
  '::cue-region()': ['#region'],
  '::cue()': ['b', '.loud'],
  '::highlight()': ['search-result'],
  '::nth-fragment()': ['2'],
  '::part()': ['label', 'label active'],
  '::picker()': ['select'],
  '::scroll-button()': ['*', 'up', 'inline-end'],
  '::slotted()': ['span', '.chip'],
  '::view-transition-group-children()': ['root'],
  '::view-transition-group()': ['*', 'root'],
  '::view-transition-image-pair()': ['root'],
  '::view-transition-new()': ['root', '.card'],
  '::view-transition-old()': ['root'],
  ':active-view-transition-type()': ['slide'],
  ':current()': ['p', '.a'],
  ':dir()': ['ltr', 'rtl'],
  ':has()': ['> img', '+ p', '.a, .b', 'img'],
  ':heading()': ['1', '2, 3'],
  ':host-context()': ['.dark'],
  ':host()': ['.compact'],
  ':is()': ['.a, .b', 'p'],
  ':lang()': ['en', '"en-US", de', '\\*-CH'],
  ':link-to()': ['"/home"'],
  ':matches()': ['.a, .b'],
  ':not()': ['.a', '.a, .b', 'p.a', ':hover', '[disabled]', ':not(.b)'],
  ':nth-child()': ['2', 'odd', 'even', '2n+1', '-n + 3', 'n', '2n of .a', 'odd of p, .b'],
  ':nth-col()': ['2n'],
  ':nth-last-child()': ['2', '-n+2 of .a'],
  ':nth-last-col()': ['odd'],
  ':nth-last-of-type()': ['2n+1'],
  ':nth-of-page()': ['2'],
  ':nth-of-type()': ['3', 'even'],
  ':nth()': ['2n of chapter'],
  ':state()': ['checked'],
  ':where()': ['.a, .b', 'p'],
}

/** Functional pseudos whose argument is a selector list, so `&` can sit inside it. */
export const SELECTOR_ARGUMENT_PSEUDOS: readonly string[] = [':is', ':where', ':not', ':has', ':matches', ':-webkit-any', ':-moz-any', ':current', ':host', ':host-context', '::slotted', '::cue']

/** The index's combinators, as a selector writes them between two compounds. */
export const COMBINATORS: Readonly<Record<string, string>> = {
  '&': '&',
  '+': ' + ',
  '>': ' > ',
  '||': ' || ',
  '~': ' ~ ',
}

/** Simple selectors outside the pseudo index. */
export const OTHER_SIMPLE: readonly string[] = [
  'p',
  'svg',
  '*',
  '.a',
  '.a-b_c',
  '#main',
  '[data-on]',
  '[data-x=on]',
  '[data-x="a b"]',
  '[data-x="a,b"]',
  "[data-x='a,b']",
  '[data-x="&"]',
  '[data-x="a)b"]',
  '[class~=wide]',
  '[lang|=en]',
  '[href^="https:"]',
  '[href$=".pdf"]',
  '[title*=help]',
  '[type=TEXT i]',
  '[type=text s]',
  'svg|rect',
  '*|rect',
  '|rect',
  '[xlink|href]',
  '.a\\:b',
  '.\\31 0',
  '#a\\.b',
  // Vendor pseudos.
  '::-webkit-scrollbar',
  '::-webkit-scrollbar-thumb',
  '::-moz-selection',
  ':-moz-focusring',
  '::-moz-placeholder',
  ':-ms-input-placeholder',
  ':-webkit-autofill',
  ':-webkit-any(.a, .b)',
  ':-moz-any(.a, .b)',
  // Pseudos stylis rewrites.
  '::placeholder',
  ':read-only',
  ':read-write',
]

/** Whether `simple` names an element type (so `&` cannot be glued before it). */
const isTypeLike = (simple: string): boolean => /^(?:[a-z*]|\|)/i.test(simple) && !simple.startsWith(':')

/** Every simple selector: the index's pseudos (functional ones with each argument) and `OTHER_SIMPLE`. */
export function simpleSelectors(): string[] {
  const out: string[] = []
  for (const { name } of SELECTOR_INDEX) {
    if (!name.startsWith(':')) continue
    if (name.endsWith('()')) {
      const base = name.slice(0, -2)
      for (const argument of FUNCTIONAL_ARGUMENTS[name] ?? []) out.push(`${base}(${argument})`)
    } else {
      out.push(name)
    }
  }
  return [...out, ...OTHER_SIMPLE]
}

/** Index entries the grammar does not cover: a functional pseudo without arguments, or an unknown combinator. */
export function uncovered(): string[] {
  return SELECTOR_INDEX.filter(({ name }) =>
    name.startsWith(':') ? name.endsWith('()') && !(FUNCTIONAL_ARGUMENTS[name]?.length) : !(name in COMBINATORS),
  ).map(({ name }) => name)
}

/** Where `&` sits relative to a simple selector `s`. */
export function placements(s: string): string[] {
  const out = [`& ${s}`, `& > ${s}`, `& + ${s}`, `& ~ ${s}`, `${s} &`, `${s} > &`, `${s} + &`, `${s} ~ &`, s, `&, ${s}`, `${s}, &`]
  if (!isTypeLike(s)) out.push(`&${s}`, `&${s}, &:hover`, `.a&${s}`)
  else out.push(`${s}&`)
  return out
}

/** `&` inside a selector-taking pseudo's argument, in each position. */
export function nodeInArguments(): string[] {
  const out: string[] = []
  for (const pseudo of SELECTOR_ARGUMENT_PSEUDOS) {
    out.push(`${pseudo}(&)`, `${pseudo}(&, .a)`, `${pseudo}(.a, &)`, `.a${pseudo}(&)`, `&${pseudo}(.a)`, `${pseudo}(& .a) p`, `${pseudo}(.a &)`)
  }
  out.push(':nth-child(2 of &)', ':nth-child(2 of .a, &)', '&:nth-child(2 of .a)', ':not(:is(&))', ':is(:not(&))', ':has(:is(&))', '.a:has(> &)', ':not(.a:has(&))')
  return out
}

/** Whitespace written around and inside a selector key. */
export const WHITESPACE: readonly ((key: string) => string)[] = [
  key => ` ${key}`,
  key => `${key} `,
  key => key.replaceAll(' ', '  '),
  key => key.replaceAll(' ', '\n'),
  key => key.replaceAll(' ', '\t'),
  key => key.replace(/\s*([>+~,])\s*/g, '$1'),
]

/** At-rules interleaved with selectors. */
export const AT_RULES: readonly string[] = ['@media (min-width: 1px)', '@supports (display: grid)', '@container (min-width: 1px)', '@media screen and (max-width: 9999px)']

/** A declaration's value: written as is, read at run time, or chosen by a condition. */
export type Value = { kind: 'static'; js: string } | { kind: 'var'; js: string } | { kind: 'switch'; js: string }

/** Values a case's declarations take. `p` is the case's run-time props. */
export const VALUES: readonly Value[] = [
  { kind: 'static', js: '"red"' },
  { kind: 'static', js: '4' },
  { kind: 'var', js: 'p.color' },
  { kind: 'switch', js: 'p.on ? "blue" : "green"' },
  { kind: 'switch', js: 'p.on ? "blue" : undefined' },
]

/** A nested css object, as source. */
export type Css = { [key: string]: string | Css | null }

/** One differential case: the node's css as an object source, and a name for reports. */
export interface Case {
  name: string
  css: Css
}

/** A block of declarations with `value`. */
const declarations = (value: string): Css => ({ color: value, marginTop: '1' })

/**
 * Every case: each selector shape as the only nested key beside a base
 * declaration, then lists, nesting, at-rules, whitespace, empty and null blocks,
 * long chains and the value kinds.
 */
export function cases(): Case[] {
  const out: Case[] = []
  const add = (name: string, css: Css) => out.push({ name, css })
  const base = (nested: Css): Css => ({ padding: '4', ...nested })

  const keys = new Set<string>()
  for (const s of simpleSelectors()) for (const key of placements(s)) keys.add(key)
  for (const key of nodeInArguments()) keys.add(key)
  for (const key of keys) add(`key ${key}`, base({ [key]: declarations('"red"') }))

  // Selector lists nested in selector lists: the cartesian product.
  const lists = ['&:hover, &:focus', '& p, & span', '.dark &, .light &', '&, .other', ':is(&, .a), &:active', '[data-x="a,b"] &, &.b']
  for (const parent of lists) for (const child of lists) add(`lists ${parent} | ${child}`, base({ [parent]: { [child]: declarations('"red"') } }))

  // Nesting 2 to 4 deep, from a set of steps.
  const steps = ['&:hover', '& > p', '.dark &', '&.a', '& + &', ':not(&)', '&::before', '& .b, & .c']
  for (const a of steps)
    for (const b of steps) {
      add(`nest ${a} | ${b}`, base({ [a]: { color: '"red"', [b]: declarations('"blue"') } }))
      for (const c of steps.slice(0, 4)) {
        add(`nest ${a} | ${b} | ${c}`, base({ [a]: { [b]: { [c]: declarations('"blue"') } } }))
        add(`nest ${a} | ${b} | ${c} | &:focus`, base({ [a]: { [b]: { [c]: { '&:focus': declarations('"blue"') } } } }))
      }
    }

  // At-rules interleaved at each depth.
  for (const at of AT_RULES)
    for (const step of steps) {
      add(`at ${at} > ${step}`, base({ [at]: { [step]: declarations('"red"') } }))
      add(`at ${step} > ${at}`, base({ [step]: { [at]: declarations('"red"') } }))
      add(`at ${step} > ${at} > &:focus`, base({ [step]: { [at]: { '&:focus': declarations('"red"') } } }))
      add(`at ${at} > ${at} > ${step}`, base({ [at]: { [AT_RULES[0]]: { [step]: declarations('"red"') } } }))
    }

  // Whitespace variants.
  for (const key of ['& > p', '.dark &', '&:hover, &:focus', ':is(&, .a) p', '& + &', '&  ~  .b'])
    for (const [i, ws] of WHITESPACE.entries()) add(`ws${i} ${JSON.stringify(ws(key))}`, base({ [ws(key)]: declarations('"red"') }))

  // Empty and null blocks.
  for (const key of ['&:hover', '& p', '@media (min-width: 1px)', ':not(&)']) {
    add(`empty ${key}`, base({ [key]: {} }))
    add(`null ${key}`, base({ [key]: null }))
    add(`null value ${key}`, base({ [key]: { color: null } }))
    add(`nested empty ${key}`, base({ [key]: { '&:focus': {} } }))
  }

  // Long chains, written and built by nesting.
  const pseudos = [':hover', ':focus', ':active', ':focus-visible', ':first-child', ':not(.a)', '.b', '[data-on]']
  add('chain written', base({ [`&${pseudos.join('')}`]: declarations('"red"') }))
  add('descendants written', base({ '& a b c d e f': declarations('"red"') }))
  let nested: Css = declarations('"red"')
  for (const pseudo of [...pseudos].reverse()) nested = { [`&${pseudo}`]: nested }
  add('chain nested', base(nested))
  nested = declarations('"red"')
  for (const tag of ['a', 'b', 'c', 'd', 'e', 'f'].reverse()) nested = { [`& ${tag}`]: nested }
  add('descendants nested', base(nested))

  // Value kinds inside blocks.
  for (const value of VALUES)
    for (const key of ['&:hover', '& > p', '.dark &', '@media (min-width: 1px)', '&::placeholder', ':not(&)'])
      add(`value ${value.kind} ${value.js} ${key}`, base({ color: value.js, [key]: { color: value.js, marginTop: value.js } }))

  return out
}
