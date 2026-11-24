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
import prefixerTable from '../crates/meonode-swc-plugin/tests/fixture/extract/prefixer.json' with { type: 'json' }
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
export const SELECTOR_ARGUMENT_PSEUDOS: readonly string[] = [
  ':is',
  ':where',
  ':not',
  ':has',
  ':matches',
  ':-webkit-any',
  ':-moz-any',
  ':current',
  ':host',
  ':host-context',
  '::slotted',
  '::cue',
]

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
  return SELECTOR_INDEX.filter(({ name }) => (name.startsWith(':') ? name.endsWith('()') && !FUNCTIONAL_ARGUMENTS[name]?.length : !(name in COMBINATORS))).map(
    ({ name }) => name,
  )
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
  out.push(
    ':nth-child(2 of &)',
    ':nth-child(2 of .a, &)',
    '&:nth-child(2 of .a)',
    ':not(:is(&))',
    ':is(:not(&))',
    ':has(:is(&))',
    '.a:has(> &)',
    ':not(.a:has(&))',
  )
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
export const AT_RULES: readonly string[] = [
  '@media (min-width: 1px)',
  '@supports (display: grid)',
  '@container (min-width: 1px)',
  '@media screen and (max-width: 9999px)',
]

/** An at-rule index entry: its name (`@media`). */
interface AtRuleEntry {
  name: string
}

/** The at-rule index. */
export const AT_RULE_INDEX: readonly AtRuleEntry[] = (webref as unknown as { atrules: AtRuleEntry[] }).atrules

/**
 * Valid preludes for every at-rule in the index, by name, as a node's css
 * writes the key (`''` for one that takes none). A new at-rule in the index
 * without an entry here fails the coverage test.
 */
export const AT_RULE_PRELUDES: Readonly<Record<string, readonly string[]>> = {
  '@-webkit-keyframes': ['fade'],
  '@annotation': [''],
  '@apply': ['--card'],
  '@bottom-center': [''],
  '@bottom-left': [''],
  '@bottom-left-corner': [''],
  '@bottom-right': [''],
  '@bottom-right-corner': [''],
  '@character-variant': [''],
  '@charset': ['"utf-8"'],
  '@color-profile': ['--swop5c'],
  '@container': [
    '(min-width: 1px)',
    'sidebar (min-width: 400px)',
    '(400px <= width <= 700px)',
    'style(--responsive: true)',
    'not (width < 1px)',
    '(min-width:  1px)',
  ],
  '@contents': [''],
  '@counter-style': ['thumbs'],
  '@custom-media': ['--narrow (max-width: 30em)'],
  '@custom-selector': [':--heading h1, h2'],
  '@else': [''],
  '@font-face': [''],
  '@font-feature-values': ['Font One'],
  '@font-palette-values': ['--identifier'],
  '@function': ['--double(--x)'],
  '@historical-forms': [''],
  '@import': ['url("a.css")'],
  '@keyframes': ['fade', '"fade in"'],
  '@layer': ['base', '', 'base.inner', 'a, b'],
  '@left-bottom': [''],
  '@left-middle': [''],
  '@left-top': [''],
  '@location': [''],
  '@media': [
    '(min-width: 1px)',
    'screen',
    'only screen and (max-width: 9999px)',
    'not print',
    'screen, print',
    '(400px <= width <= 700px)',
    '(hover: hover) and (pointer: fine)',
    '(prefers-color-scheme: dark)',
    '(min-resolution: 2dppx), (-webkit-min-device-pixel-ratio: 2)',
    '(min-width:  1px)',
    '(min-width:1px)',
    'screen and (min-width: 1px) and (max-width: 2px)',
  ],
  '@mixin': ['--m()'],
  '@namespace': ['svg url(http://www.w3.org/2000/svg)'],
  '@navigation': [''],
  '@ornaments': [''],
  '@page': ['', ':first', 'wide:left'],
  '@position-try': ['--top'],
  '@private': [''],
  '@property': ['--angle'],
  '@right-bottom': [''],
  '@right-middle': [''],
  '@right-top': [''],
  '@scope': ['(.card)', '(.card) to (.content)', ''],
  '@starting-style': [''],
  '@styleset': [''],
  '@stylistic': [''],
  '@supports': [
    '(display: grid)',
    'not (display: grid)',
    '(display: grid) and (gap: 1px)',
    '(a: b) or (c: d)',
    'selector(:has(a))',
    'font-tech(color-COLRv1)',
    '(display:grid)',
  ],
  '@supports-condition': ['--thing'],
  '@swash': [''],
  '@top-center': [''],
  '@top-left': [''],
  '@top-left-corner': [''],
  '@top-right': [''],
  '@top-right-corner': [''],
  '@view-transition': [''],
  '@when': ['media(width >= 1px)'],
}

/** Every at-rule key: each index entry with each of its preludes. */
export function atRuleKeys(): string[] {
  return AT_RULE_INDEX.flatMap(({ name }) => (AT_RULE_PRELUDES[name] ?? []).map(prelude => (prelude ? `${name} ${prelude}` : name)))
}

/** At-rule index entries without preludes here. */
export function uncoveredAtRules(): string[] {
  return AT_RULE_INDEX.filter(({ name }) => !AT_RULE_PRELUDES[name]?.length).map(({ name }) => name)
}

/**
 * A declaration's value: written as is, computed from run-time props (a
 * template literal or arithmetic, which the compiler writes as a CSS variable),
 * chosen by a condition, or left to the runtime (a member read, which may hold
 * a theme function).
 */
export type Value = { kind: 'static' | 'var' | 'switch' | 'runtime'; js: string }

/** Values a case's declarations take. `p` is the case's run-time props ([`PROPS`]). */
export const VALUES: readonly Value[] = [
  { kind: 'static', js: '"red"' },
  { kind: 'static', js: '4' },
  { kind: 'var', js: '`${p.color}`' },
  { kind: 'var', js: 'p.n * 2' },
  { kind: 'switch', js: 'p.on ? "blue" : "green"' },
  { kind: 'switch', js: 'p.on ? 4 : 8' },
  { kind: 'switch', js: 'p.on ? "blue" : undefined' },
  { kind: 'switch', js: 'p.on && "blue"' },
  { kind: 'runtime', js: 'p.color' },
]

/**
 * Custom property names: plain, camel case (Emotion keeps it as written),
 * leading underscore or digit, non-ASCII, escaped, and the bare `--`.
 */
export const CUSTOM_PROPERTY_NAMES: readonly string[] = ['--x', '--myVar', '--a-b', '--_x', '--0', '--é', '--\\31 a', '--']

/** Custom property values, as source: numbers stay unitless, and any token stream is kept as written. */
export const CUSTOM_PROPERTY_VALUES: readonly string[] = [
  '0',
  '-1',
  '1.5',
  '""',
  '"red !important"',
  '"1px 2px / 3"',
  '"a, b"',
  '"[a] (b) c"',
  '"  spaced  out  "',
  '"var(--y)"',
  '"var(--y, 2px)"',
  '"calc(1px + var(--y))"',
  '"theme.colors.primary"',
  '"var(--meonode-theme-colors-primary)"',
  ...VALUES.filter(v => v.kind !== 'static').map(v => v.js),
]

/** Where a custom property is set: top level, pseudo-classes and elements, a descendant, an at-rule. */
export const CUSTOM_PROPERTY_PLACEMENTS: readonly string[] = ['', '&:hover', '&::before', '& p', '@media (min-width: 1px)', '@media (min-width: 1px) > &:hover']

/** At-rule keys spelled in other cases, across lines, and with tokens and vendor features in their preludes. */
export const AT_RULE_SPELLINGS: readonly string[] = [
  '@MEDIA (min-width: 1px)',
  '@Media (min-width: 1px)',
  '@SUPPORTS (display: grid)',
  '@CONTAINER (min-width: 1px)',
  '@media\n(min-width: 1px)',
  '@media (min-width: 1px)\nand (max-width: 2px)',
  '@media\t(min-width: 1px)',
  '@media screen and (-webkit-min-device-pixel-ratio: 2)',
  '@media (min-width: theme.breakpoints.md)',
  '@supports (display: theme.display)',
  '@container theme.name (min-width: 1px)',
]

/** Statement at-rules, written as a key with a string value. */
export const STATEMENT_AT_RULES: readonly [string, string][] = [
  ['@import', '"url(x.css)"'],
  ['@charset', '"\\"utf-8\\""'],
  ['@namespace', '"svg url(http://www.w3.org/2000/svg)"'],
  ['@layer', '"a, b"'],
]

/** Declarations the prefixer rewrites, from the compiler's prefixer table, as css keys and value sources. */
export function prefixedDeclarations(): [string, string][] {
  const out: [string, string][] = []
  for (const [declaration, , written] of prefixerTable as [string, number, string][]) {
    if (written === `.x{${declaration}}`) continue
    const colon = declaration.indexOf(':')
    const property = declaration.slice(0, colon)
    const value = declaration.slice(colon + 1).replace(/;$/, '')
    out.push([property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), JSON.stringify(value)])
  }
  return out
}

/** The run-time props each case renders with, so every value takes each branch. */
export const PROPS = [
  { color: 'purple', on: true, n: 3, tone: 'primary', size: 'md', wrap: 'wrap', big: 3n },
  { color: 'teal', on: false, n: 5, tone: 'flex', size: 'lg', wrap: 'nowrap', big: 5n },
] as const

/** A nested css object, as source. */
export type Css = { [key: string]: string | Css | null }

/** One differential case: the node's css as an object source, and a name for reports. */
export interface Case {
  name: string
  css: Css
  /** A second node's css, rendered as the first node's child in the same document. */
  pair?: Css
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

  // Every at-rule in the index: holding a declaration, a selector, and
  // nested in a selector, with the base declarations beside it.
  for (const at of atRuleKeys()) {
    add(`at-rule ${at}`, base({ [at]: declarations('"red"') }))
    add(`at-rule ${at} > &:hover`, base({ [at]: { '&:hover': declarations('"red"') } }))
    add(`at-rule &:hover > ${at}`, base({ '&:hover': { [at]: declarations('"red"') } }))
    add(`at-rule ${at} > ${AT_RULES[0]}`, base({ [at]: { [AT_RULES[0]]: declarations('"red"') } }))
  }
  // A frames block, as keyframes hold.
  add('at-rule keyframes frames', base({ '@keyframes fade': { from: { opacity: '0' }, '50%': { opacity: '0.5' }, to: { opacity: '1' } } }))

  // Cascade: two blocks setting one property, in both orders, beside the
  // base declaration, from every kind of rule the compiler writes (atomic
  // pseudo and at-rule classes, per-node rules) and leaves to the runtime.
  const rivals = [
    '&:hover',
    ':hover',
    '&:hover:focus',
    '@media (min-width: 1px)',
    '@supports (display: grid)',
    '&:where(.x)',
    ':where(.d) &',
    ':is(&)',
    '.dark &',
    '&.a',
    '&:not(.a)',
    '&::before',
    '& + &',
    '@layer x',
    '&[data-on]',
  ]
  for (const a of rivals)
    for (const b of rivals) {
      if (a === b) continue
      add(`cascade ${a} | ${b}`, { color: '"red"', [a]: { color: '"blue"' }, [b]: { color: '"green"' } })
      add(`cascade overlap ${a} | ${b}`, { margin: '1', [a]: { marginTop: '2' }, [b]: { marginBlock: '3' } })
    }
  for (const at of ['@media (min-width: 1px)', '@supports (display: grid)'])
    for (const s of ['&:hover', '&:where(.x)', '.dark &']) {
      add(`cascade nested ${at} > ${s} | ${s} > ${at}`, { color: '"red"', [at]: { [s]: { color: '"blue"' } }, [s]: { [at]: { color: '"green"' } } })
      add(`cascade nested ${s} > ${at} | ${at} > ${s}`, { color: '"red"', [s]: { [at]: { color: '"blue"' } }, [at]: { [s]: { color: '"green"' } } })
    }

  // Two nodes writing the same pair of rules in opposite orders, in one
  // document: each node's own order decides, whatever the other wrote.
  for (const [a, b] of [
    ['&:hover', '@media (min-width: 1px) > &:hover'],
    ['&:where(.x)', '@media (min-width: 1px)'],
    ['&:hover', '&:focus'],
  ]) {
    const block = (key: string, css: Css): Css => (key.includes(' > ') ? { [key.split(' > ')[0]]: { [key.split(' > ')[1]]: css } } : { [key]: css })
    const one = { ...block(a, { color: '"red"' }), ...block(b, { color: '"blue"' }) }
    const other = { ...block(b, { color: '"blue"' }), ...block(a, { color: '"red"' }) }
    out.push({ name: `pair ${a} | ${b}`, css: one, pair: other })
    out.push({ name: `pair ${b} | ${a}`, css: other, pair: one })
  }

  // Cross-node: a parent's rule reaching its child against the child's own
  // rule. Emotion inserts in render order, so the child wins a tie. The
  // differential compares each node's own rules; the browser parity suite
  // reads the child's computed style.
  out.push({ name: 'cross & > * | child base', css: { '& > *': { color: '"red"' } }, pair: { color: '"blue"' } })
  out.push({ name: 'cross & > * | child @media', css: { '& > *': { color: '"red"' } }, pair: { '@media (min-width: 1px)': { color: '"blue"' } } })
  out.push({ name: 'cross & > * | child &:hover', css: { '& > *:hover': { color: '"red"' } }, pair: { '&:hover': { color: '"blue"' } } })
  out.push({ name: 'cross & > div | child base', css: { '& > div': { color: '"red"' } }, pair: { color: '"blue"' } })
  out.push({ name: 'cross & * | child base', css: { '& *': { color: '"red"' } }, pair: { color: '"blue"' } })
  out.push({ name: 'cross & > * | child var', css: { '& > *': { color: '"red"' } }, pair: { color: '`${p.color}`' } })

  // Overlapping properties in one context, one of them also on another node
  // whose rules register first (the compiler visits a child's call before its
  // parent's): the node's own source order must still decide.
  out.push({ name: 'pair overlap after another node', css: { padding: '"4px"', paddingTop: '"2px"' }, pair: { paddingTop: '"2px"' } })

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
    for (const key of [
      '&:hover',
      '& > p',
      '.dark &',
      '@media (min-width: 1px)',
      '&::placeholder',
      ':not(&)',
      '&:where(.x)',
      '@media (min-width: 1px) > &:hover',
    ])
      add(
        `value ${value.kind} ${value.js} ${key}`,
        base(
          key.includes(' > ')
            ? { [key.split(' > ')[0]]: { [key.split(' > ')[1]]: { color: value.js, marginTop: value.js } } }
            : { color: value.js, [key]: { color: value.js, marginTop: value.js } },
        ),
      )
  // Two run-time values in one block, and run-time values in two blocks.
  add('value two in a block', base({ '&:hover': { color: '`${p.color}`', marginTop: 'p.on ? 4 : 8' } }))
  add('value in two blocks', base({ '&:hover': { color: 'p.on ? "blue" : "green"' }, '& > p': { color: '`${p.color}`' } }))
  // One selector under two at-rules, each with its own run-time value.
  add(
    'value one selector in two at-rules',
    base({ '.dark &': { color: '`${p.color}`' }, '@media (min-width: 1px)': { '.dark &': { color: 'p.on ? "blue" : "green"' } } }),
  )
  // A run-time value of a property the prefixer rewrites by value, in a block.
  add('value prefixed by value in a block switch', base({ '.dark &': { display: 'p.on ? "flex" : "block"' } }))
  add('value prefixed by value in a block var', base({ '.dark &': { display: '`${p.on ? "flex" : "grid"}`' } }))

  // At-rule spellings, each holding declarations, a selector, and inside one.
  for (const at of AT_RULE_SPELLINGS) {
    add(`spelling ${JSON.stringify(at)}`, base({ [at]: declarations('"red"') }))
    add(`spelling ${JSON.stringify(at)} > &:hover`, base({ [at]: { '&:hover': declarations('"red"') } }))
    add(`spelling &:hover > ${JSON.stringify(at)}`, base({ '&:hover': { [at]: declarations('"red"') } }))
  }

  // At-rules three deep, with a selector innermost and between.
  for (const a of AT_RULES)
    for (const b of AT_RULES)
      for (const c of AT_RULES) {
        add(`deep ${a} > ${b} > ${c}`, base({ [a]: { [b]: { [c]: declarations('"red"') } } }))
        add(`deep ${a} > ${b} > ${c} > &:hover`, base({ [a]: { [b]: { [c]: { '&:hover': declarations('"red"') } } } }))
        add(`deep ${a} > &:hover > ${b} > ${c}`, base({ [a]: { '&:hover': { [b]: { [c]: declarations('"red"') } } } }))
      }

  // The prefixer inside at-rules: every declaration it rewrites, in a media
  // query, and each property's first in a selector inside a feature query.
  const prefixedProperties = new Set<string>()
  for (const [key, value] of prefixedDeclarations()) {
    add(`prefixed @media ${key}: ${value}`, base({ '@media (min-width: 1px)': { [key]: value } }))
    if (prefixedProperties.has(key)) continue
    prefixedProperties.add(key)
    add(`prefixed @supports > &:hover ${key}: ${value}`, base({ '@supports (display: grid)': { '&:hover': { [key]: value } } }))
  }

  // Statement at-rules, at the top and inside a selector and a media query.
  for (const [at, value] of STATEMENT_AT_RULES) {
    add(`statement ${at}`, base({ [at]: value }))
    add(`statement &:hover > ${at}`, base({ '&:hover': { [at]: value } }))
    add(`statement @media > ${at}`, base({ '@media (min-width: 1px)': { [at]: value } }))
  }

  // @layer in each shape: a statement, named, anonymous, under a selector and
  // under a media query, and a statement ordering the named layers after it.
  add('layer statement', base({ '@layer a, b': {} }))
  add('layer named', base({ '@layer x': declarations('"red"') }))
  add('layer anonymous', base({ '@layer': declarations('"red"') }))
  add('layer &:hover > @layer', base({ '&:hover': { '@layer x': declarations('"red"') } }))
  add('layer @media > @layer', base({ '@media (min-width: 1px)': { '@layer x': declarations('"red"') } }))
  add('layer @layer > &:hover', base({ '@layer x': { '&:hover': declarations('"red"') } }))
  add('layer statement then named', { color: '"green"', '@layer a, b': {}, '@layer b': { color: '"blue"' }, '@layer a': { color: '"red"' } })

  // Custom properties: every name, every value, at every placement.
  const placed = (placement: string, css: Css): Css => {
    if (!placement) return css
    const [outer, inner] = placement.split(' > ')
    return inner ? { [outer]: { [inner]: css } } : { [outer]: css }
  }
  for (const placement of CUSTOM_PROPERTY_PLACEMENTS) {
    for (const name of CUSTOM_PROPERTY_NAMES) add(`custom ${name} "red" ${placement}`, base(placed(placement, { [name]: '"red"' })))
    for (const value of CUSTOM_PROPERTY_VALUES) add(`custom --x ${value} ${placement}`, base(placed(placement, { '--x': value })))
  }
  for (const name of CUSTOM_PROPERTY_NAMES) for (const value of CUSTOM_PROPERTY_VALUES) add(`custom ${name} ${value}`, base({ [name]: value }))
  // Set and read on the node, and names differing only in case.
  add('custom set and read', { '--x': '"red"', color: '"var(--x)"', '&:hover': { '--x': '"blue"' } })
  add('custom case', { '--myVar': '"red"', '&:hover': { '--myvar': '"blue"' }, color: '"var(--myVar)"' })
  add('custom case reversed', { '&:hover': { '--myVar': '"blue"' }, '--myvar': '"red"', color: '"var(--myvar)"' })
  return out
}
