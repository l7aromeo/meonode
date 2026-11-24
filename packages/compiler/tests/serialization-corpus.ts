// The call sites the serialization differential compares, shared with the
// runtime's own fixtures (the client-against-server-component one among them).
// Each is factory-call source in which `ATTR` stands for the case's attribute,
// `ATTR_PAIR` for its pair's, and `p` for the run-time props ([`PROPS`]).
import { type Case, type Css, cases, PROPS } from './selector-grammar'

export { PROPS }

/**
 * Top-level `const` bindings the calls may read, as source: the module the
 * calls are written in declares each, so the compiler resolves them as it
 * resolves a same-file constant.
 */
export const CORPUS_CONSTS: Record<string, string> = {
  BRACE_VALUE: `'theme.primary {a}'`,
}

/** `css` as JavaScript source. */
function source(css: Css): string {
  const entries = Object.entries(css).map(
    ([key, value]) => `${JSON.stringify(key)}: ${value === null ? 'null' : typeof value === 'string' ? value : source(value)}`,
  )
  return `{ ${entries.join(', ')} }`
}

/** One call site under test: `call` is factory-call source in which `ATTR` stands for the case's attribute. */
export interface Call {
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
  { name: 'token with a brace', call: `Div({ ATTR, css: { color: 'theme.primary {a}' } })` },
  { name: 'const token with a brace', call: `Div({ ATTR, css: { color: BRACE_VALUE } })` },
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

/**
 * VAR values, each a hole in a template: where Emotion adds `px` and where it
 * does not, tokens, nested contexts, a template beside SWITCH choices, and the
 * keys a hole may not take.
 */
const VAR_CALLS: readonly Call[] = [
  { name: 'var template', call: `Div({ ATTR, css: { width: \`\${p.n}%\` } })` },
  { name: 'var number px', call: `Div({ ATTR, css: { height: p.n * 2 } })` },
  { name: 'var number unitless', call: `Div({ ATTR, css: { lineHeight: p.n / 2, opacity: p.n - 3, zIndex: +p.n } })` },
  { name: 'var zero', call: `Div({ ATTR, css: { margin: p.n - p.n } })` },
  { name: 'var custom property', call: `Div({ ATTR, css: { '--gap': p.n * 1 } })` },
  { name: 'var concat', call: `Div({ ATTR, css: { padding: p.n + 'px', margin: 'auto ' + p.n } })` },
  { name: 'var token', call: `Div({ ATTR, css: { color: \`theme.\${p.tone}\` } })` },
  { name: 'var token in a length', call: `Div({ ATTR, css: { padding: \`theme.spacing.\${p.size}\` } })` },
  { name: 'var undefined read', call: `Div({ ATTR, css: { color: \`\${p.missing}\` } })` },
  { name: 'var nested', call: `Div({ ATTR, css: { '&:hover': { width: p.n * 3 }, '@media (min-width: 1px)': { top: \`\${p.n}px\` } } })` },
  { name: 'var flexShrink', call: `Div({ ATTR, display: 'flex', flexShrink: p.n * 1 })` },
  { name: 'var minHeight', call: `Div({ ATTR, minHeight: p.n * 1, color: 'red' })` },
  { name: 'var beside switch', call: `Div({ ATTR, color: p.on ? 'red' : 'blue', width: p.n * 2 })` },
  { name: 'var two', call: `Div({ ATTR, width: p.n * 2, height: \`\${p.n}vh\`, color: 'red' })` },
  { name: 'var Row', call: `Row({ ATTR, gap: p.n * 2 })` },
  { name: 'var nested unitless', call: `Div({ ATTR, css: { '&:hover': { opacity: p.n * 1 } } })` },
  { name: 'var holes out of key order', call: `Div({ ATTR, width: p.n * 2, flexShrink: p.n * 1 })` },
  { name: 'var holes out of key order in css', call: `Div({ ATTR, css: { width: p.n * 2, flexShrink: p.n * 1 } })` },
  { name: 'var token with a brace', call: `Div({ ATTR, css: { color: \`theme.\${p.tone} {a}\` } })` },
  { name: 'var flexWrap', call: `Div({ ATTR, display: 'flex', flexWrap: \`\${p.wrap}\` })` },
  { name: 'var member read', call: `Div({ ATTR, css: { color: p.missing, width: p.n * 2 } })` },
  { name: 'var keyframes text', call: `Div({ ATTR, css: { animation: \`_EMO_spin_from{opacity:0}_EMO_ \${p.n}s\` } })` },
  { name: 'var marker in a known value', call: `Div({ ATTR, css: { content: '"\\uE0000\\uE001"', width: p.n * 2 } })` },
  { name: 'var marker naming a real hole', call: `Div({ ATTR, css: { width: p.n * 2, content: '"\\uE0000\\uE001"' } })` },
  { name: 'var display deciding flexShrink', call: `Div({ ATTR, display: \`\${p.tone}\`, flexWrap: 'wrap' })` },
  { name: 'var sum of reads', call: `Div({ ATTR, css: { width: p.n + p.n, fontFamily: p.tone + p.size } })` },
  { name: 'var display', call: `Div({ ATTR, display: \`\${p.tone}\` })` },
  { name: 'var flex', call: `Div({ ATTR, flex: p.n * 1 })` },
  { name: 'var nested display', call: `Div({ ATTR, css: { '&:hover': { display: \`\${p.tone}\` } } })` },
  { name: 'var label', call: `Div({ ATTR, css: { label: \`x\${p.n}\`, color: 'red' } })` },
  { name: 'var animation', call: `Div({ ATTR, css: { animation: \`spin \${p.n}s\` } })` },
  { name: 'var value with a brace', call: `Div({ ATTR, css: { content: \`"\${p.tone}{"\` } })` },
]

/**
 * Flat props in the order `processProps` writes them: primitive values first,
 * then the rest, each in source order. Every ordered pair of value kinds the
 * compiler can write, on two flat props that write one property, in both key
 * orders, and again with `css` setting the first key, which keeps the place its
 * flat value gives it, and with `css` adding a key, which goes after every flat
 * prop.
 */
const ORDER_KINDS: Record<string, (key: string) => string> = {
  string: key => (key === 'margin' ? `'1px'` : `'6px'`),
  number: key => (key === 'margin' ? '3' : '8'),
  boolean: () => 'true',
  null: () => 'null',
  undefined: () => 'undefined',
  object: () => '{}',
  'switch to null': key => `p.on ? null : ${key === 'margin' ? 2 : 9}`,
  'var string': key => `\`\${p.n}${key === 'margin' ? 'em' : 'px'}\``,
  'var arithmetic': key => `p.n * ${key === 'margin' ? 2 : 3}`,
  'var bigint': key => `p.big * ${key === 'margin' ? 2 : 3}n`,
}
function orderCalls(): Call[] {
  const out: Call[] = []
  for (const [first, second] of [
    ['margin', 'marginTop'],
    ['marginTop', 'margin'],
  ]) {
    for (const [firstKind, firstValue] of Object.entries(ORDER_KINDS)) {
      for (const [secondKind, secondValue] of Object.entries(ORDER_KINDS)) {
        const props = `${first}: ${firstValue(first)}, ${second}: ${secondValue(second)}`
        out.push({ name: `order ${first}: ${firstKind}, ${second}: ${secondKind}`, call: `Div({ ATTR, ${props} })` })
        out.push({ name: `order ${first}: ${firstKind}, ${second}: ${secondKind}, css ${first}`, call: `Div({ ATTR, ${props}, css: { ${first}: 5 } })` })
        out.push({ name: `order ${first}: ${firstKind}, ${second}: ${secondKind}, css adds`, call: `Div({ ATTR, ${props}, css: { paddingTop: 4 } })` })
      }
    }
  }
  return out
}

/** Every call the differential compares, in its order. */
export function corpusCalls(): Call[] {
  return [...grammarCalls(cases()), ...SERIAL_CALLS, ...VAR_CALLS, ...orderCalls()]
}
