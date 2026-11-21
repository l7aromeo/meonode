// Compares one side's record of a case against the oracle's (the runtime
// side's), dimension by dimension. Each difference names its dimension, so a
// planted failure can be checked for the dimension it was planted in.

/** The dimensions a difference is reported under. */
export const DIMENSIONS = ['ssr-html', 'hydration', 'console', 'tree', 'computed', 'pseudo-element', 'forced-state', 'breakpoint', 'color-scheme', 'theme-mode', 'state-step']

/** The parts of an element's styles, by index in a record. */
const PARTS = ['', '::before', '::after']

/**
 * Server HTML with what the comparison ignores taken out: style and script
 * elements, class attributes and `--mv-*` inline variables.
 */
export function normalizeHtml(html) {
  return html
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
      if (a[prop] !== b[prop]) add('forced-state', `element ${key}`, `${prop}: oracle ${JSON.stringify(a[prop] ?? '(unchanged)')} / side ${JSON.stringify(b[prop] ?? '(unchanged)')}`)
    }
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
  }
  return out
}
