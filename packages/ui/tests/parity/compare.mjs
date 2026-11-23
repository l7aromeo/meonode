// Compares one side's record of a case against the oracle's (the runtime
// side's), dimension by dimension. Each difference names its dimension, so a
// planted failure can be checked for the dimension it was planted in.

/** The dimensions a difference is reported under. */
export const DIMENSIONS = [
  'ssr-html',
  'hydration',
  'console',
  'tree',
  'computed',
  'pseudo-element',
  'forced-state',
  'breakpoint',
  'color-scheme',
  'theme-mode',
  'state-step',
  'identity',
  'exact-markup',
  'rule-text',
  'first-paint',
  'duplicate-rule',
]

/** The parts of an element's styles, by index in a record. */
const PARTS = ['', '::before', '::after', '::placeholder', '::selection']

/**
 * Server HTML with what the comparison ignores taken out: style and script
 * elements, class attributes, `--mv-*` inline variables, and React's empty
 * `<!-- -->` text separators, which render nothing and follow the number of
 * child slots (a host with extracted styles has one more). Suspense markers
 * (`<!--$-->` and the like) are kept.
 */
export function normalizeHtml(html) {
  return html
    .replaceAll('<!-- -->', '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<link\b[^>]*>/g, '')
    .replace(/ class="[^"]*"/g, '')
    .replace(/ style="([^"]*)"/g, (_, css) => {
      const kept = css
        .split(';')
        .filter(d => d.trim() && !d.trim().startsWith('--mv-'))
        .join(';')
      return kept ? ` style="${kept}"` : ''
    })
}

/** The first differing line of two string lists, with a little context. */
function firstDifference(a, b) {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return `line ${i + 1}: oracle ${JSON.stringify(a[i] ?? '(none)')} / side ${JSON.stringify(b[i] ?? '(none)')}`
  return null
}

/** Every differing computed value between two style records. */
function styleDifferences(a, b) {
  const out = []
  if (a.elements.length !== b.elements.length) return [`${a.elements.length} elements in the oracle, ${b.elements.length} on the side`]
  if (a.props.join() !== b.props.join()) return ['different computed property lists']
  a.elements.forEach((parts, e) =>
    parts.forEach((values, part) =>
      values.forEach((v, p) => {
        const w = b.elements[e][part][p]
        if (v !== w) out.push({ part, text: `${a.paths[e]}${PARTS[part]} ${a.props[p]}: oracle ${JSON.stringify(v)} / side ${JSON.stringify(w)}` })
      }),
    ),
  )
  return out
}

/** The dimension a difference in a given environment belongs to: the first way it departs from the base environment. */
function envDimension(env, base) {
  const [width, scheme, mode] = env.split(' ')
  const [bw, bs, bm] = base.split(' ')
  if (width !== bw) return 'breakpoint'
  if (scheme !== bs) return 'color-scheme'
  if (mode !== bm) return 'theme-mode'
  return null
}

/**
 * Differences in the elements a case marks `data-parity-exact`, between the
 * "off" record and the "on" one: their markup with class names, and the text
 * of the rules naming those classes, must be the same exactly. These are the
 * nodes that must render as the same call site with extraction off.
 * @returns `{ dimension, where, text }` for each difference.
 */
export function compareExact(off, on) {
  const out = []
  const add = (where, text) => out.push({ dimension: 'exact-markup', where, text })
  const a = off.exact ?? []
  const b = on.exact ?? []
  if (a.length !== b.length) add('marked elements', `${a.length} with extraction off, ${b.length} with it on`)
  a.forEach((x, i) => {
    const y = b[i]
    if (!y) return
    if (x.html !== y.html) add(`marked element ${i + 1}`, `markup: off ${JSON.stringify(x.html.slice(0, 200))} / on ${JSON.stringify(y.html.slice(0, 200))}`)
    const rules = firstDifference(x.rules, y.rules)
    if (rules) add(`marked element ${i + 1}`, `rules, ${rules}`)
  })
  return out
}

/**
 * The Emotion cache keys a page may name classes with: MeoNode's own, Emotion's
 * default, and every key a corpus case passes to `createCache` (run.mjs fails
 * on a corpus key missing here).
 */
export const CACHE_KEYS = ['meonode-css', 'css', 'other', 'pre', 'ip']
const CLASS_NAME = new RegExp(`\\.(?:${CACHE_KEYS.join('|')})-[\\w-]+|\\.mn-[\\w-]+`, 'g')

/** A selector with MeoNode's and Emotion's class names replaced by `.&`, so the two can be compared. */
const normalizeSelector = selector => selector.replace(CLASS_NAME, '.&')

/** A context opened by a statement at-rule, which takes no block. */
const STATEMENT_BLOCK = /(?:^|\s)@(?:import|charset|namespace)\b/

/** The text of each style element in some server HTML, one entry per element. */
const styleTexts = html => [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1])

/** A statement at-rule a sheet honours only before its first rule. */
const LEADING_STATEMENT = /^@(?:import|charset|namespace)\b/

/**
 * The rule tuples of some server HTML, read as a browser reads it: each style
 * element is a sheet of its own, so an open statement at the end of one never
 * runs into the next, and the tuples of all sheets are joined.
 */
function htmlTuples(html, compile) {
  const out = new Set()
  out.variables = new Set()
  for (const css of styleTexts(html)) {
    const sheet = ruleTuples(css, compile)
    for (const t of sheet) out.add(t)
    for (const v of sheet.variables) out.variables.add(v)
  }
  return out
}

/**
 * The rules some CSS sets, read with stylis's own parser, as
 * `<at-rule context>|<selector>|<declaration>` entries: every rule for a
 * selector beyond an element's own class, every rule inside an at-rule (the
 * element's own class included, so vendor-prefixed pairs there are compared),
 * an at-rule's own descriptors (selector `@`), and each statement at-rule or
 * empty at-rule block (selector `statement`). Class names are normalized in
 * selectors and preludes. A declaration holding a `--mv-*` variable is left
 * out, since its value is the variable's, and its place
 * (`<context>|<selector>|<property>`) is listed in `variables`, so the other
 * side's declaration there is left out too. Blocks under a statement at-rule
 * (`@import`, `@charset`, `@namespace` written as a block in a node's css)
 * are left out: the browser drops them, and stylis writes them differently
 * beside other declarations.
 */
export function ruleTuples(css, compile) {
  const out = new Set()
  out.variables = new Set()
  const add = (context, selector, decl) => {
    if (STATEMENT_BLOCK.test(context)) return
    if (String(decl.children).includes('var(--mv-')) out.variables.add(`${context}|${selector}|${decl.props}`)
    else out.add(`${context}|${selector}|${decl.props}:${decl.children}`)
  }
  // A sheet ignores @import, @charset and @namespace once any rule comes before them, so they set nothing there.
  let ruled = false
  const walk = (nodes, context) => {
    for (const node of nodes) {
      if (context === '' && LEADING_STATEMENT.test(node.value ?? '') && !node.children?.length) {
        if (!ruled) out.add(`|statement|${normalizeSelector(node.value).replace(/;$/, '')}`)
        continue
      }
      if (context === '') ruled = true
      if (node.type === 'decl') add(context, '@', node)
      else if (node.type === 'rule') {
        for (const raw of node.props) {
          const selector = normalizeSelector(raw)
          if (selector === '.&' && context === '') continue
          for (const child of node.children) if (child.type === 'decl') add(context, selector, child)
        }
        walk(
          node.children.filter(child => child.type !== 'decl'),
          context,
        )
      } else if (Array.isArray(node.children) && node.children.length) walk(node.children, `${context}${normalizeSelector(node.value)} `)
      else if (node.type !== 'comm') out.add(`${context}|statement|${normalizeSelector(node.value)}`)
    }
  }
  walk(compile(css), '')
  return out
}

/**
 * Differences in the rules the server HTML of "off" and "on" set for
 * selectors: the same selector must set the same declarations, whether or not
 * the browser under test supports it (one that does not drops the rule, so
 * only its text can be compared).
 * @returns `{ dimension, where, text }` for each difference.
 */
export function compareRuleText(offHtml, onHtml, compile) {
  const off = htmlTuples(offHtml, compile)
  const on = htmlTuples(onHtml, compile)
  const out = []
  // The place of a declaration: everything before the value.
  const place = t => t.slice(0, t.indexOf(':', t.lastIndexOf('|')))
  for (const t of off)
    if (!on.has(t) && !on.variables.has(place(t))) out.push({ dimension: 'rule-text', where: 'server CSS', text: `only with extraction off: ${t}` })
  for (const t of on) if (!off.has(t)) out.push({ dimension: 'rule-text', where: 'server CSS', text: `only with extraction on: ${t}` })
  return out
}

/**
 * Every difference between the oracle's record and a side's.
 * @param oracle The runtime side's record and server HTML: `{ record, html }`.
 * @param side The compared side's: `{ record, html }`.
 * @returns `{ dimension, where, text }` for each difference.
 */
export function compareRecords(oracle, side) {
  const out = []
  const add = (dimension, where, text) => out.push({ dimension, where, text })

  const oracleHtml = normalizeHtml(oracle.html)
  const sideHtml = normalizeHtml(side.html)
  if (oracleHtml !== sideHtml) add('ssr-html', 'server HTML', firstDifference(oracleHtml.split(/(?=<)/), sideHtml.split(/(?=<)/)))

  if (oracle.record.hydration.length) add('hydration', 'oracle', `the oracle itself reports: ${oracle.record.hydration.join(' | ')}`)
  for (const e of side.record.hydration) add('hydration', 'side', e)
  for (const m of side.record.console) if (!oracle.record.console.includes(m)) add('console', 'side', m)
  for (const rule of side.record.duplicateRules ?? []) add('duplicate-rule', 'page stylesheets', rule)

  const envs = Object.keys(oracle.record.envs)
  const base = envs[0]
  for (const env of envs) {
    const a = oracle.record.envs[env]
    const b = side.record.envs[env]
    if (!b) {
      add('tree', env, 'environment missing on the side')
      continue
    }
    const tree = firstDifference(a.tree, b.tree)
    if (tree) add('tree', env, tree)
    for (const d of styleDifferences(a.styles, b.styles)) {
      const dimension = (env !== base && envDimension(env, base)) || (typeof d === 'object' && d.part ? 'pseudo-element' : 'computed')
      add(dimension, env, typeof d === 'string' ? d : d.text)
    }
  }

  for (const key of new Set([...Object.keys(oracle.record.forced), ...Object.keys(side.record.forced)])) {
    const a = oracle.record.forced[key] ?? {}
    const b = side.record.forced[key] ?? {}
    for (const prop of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[prop] !== b[prop])
        add('forced-state', `element ${key}`, `${prop}: oracle ${JSON.stringify(a[prop] ?? '(unchanged)')} / side ${JSON.stringify(b[prop] ?? '(unchanged)')}`)
    }
  }

  // The server HTML before hydration, when the case records it (meta.firstPaint).
  for (const [env, a] of Object.entries(oracle.record.firstPaint ?? {})) {
    const b = side.record.firstPaint?.[env]
    if (!b) {
      add('first-paint', env, 'first paint missing on the side')
      continue
    }
    const tree = firstDifference(a.tree, b.tree)
    if (tree) add('first-paint', env, tree)
    for (const d of styleDifferences(a.styles, b.styles)) add('first-paint', env, typeof d === 'string' ? d : d.text)
  }

  for (const step of Object.keys(oracle.record.steps)) {
    const a = oracle.record.steps[step]
    const b = side.record.steps[step]
    if (!b) {
      add('state-step', step, 'step missing on the side')
      continue
    }
    const tree = firstDifference(a.tree, b.tree)
    if (tree) add('state-step', step, tree)
    for (const d of styleDifferences(a.styles, b.styles)) add('state-step', step, typeof d === 'string' ? d : d.text)
    // Which elements the step kept: a side that remounts what the oracle keeps loses that subtree's state.
    const length = Math.max(a.identity?.length ?? 0, b.identity?.length ?? 0)
    const changed = []
    for (let i = 0; i < length; i++) if (a.identity?.[i] !== b.identity?.[i]) changed.push(i)
    if (changed.length)
      add(
        'identity',
        step,
        `${changed.length} element(s) differ in identity, first element ${changed[0]}: oracle ${JSON.stringify(a.identity?.[changed[0]] ?? null)} / side ${JSON.stringify(b.identity?.[changed[0]] ?? null)}`,
      )
  }
  return out
}
