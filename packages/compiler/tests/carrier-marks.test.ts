// The carrier mark `__meo$r` must be on every named node that, on some render,
// begins a stretch of named nodes whose styles no runtime node takes: the
// stretch starts at the walk's start or after a component, and ends at a
// component or the walk's end. The mark is a call site's, the same on every
// render, so over conditions it may be on more nodes than one render needs,
// but never on a node that is not named, and on a walk without conditions on
// exactly the nodes that need it.
//
// Walks are generated from named, runtime and unstyled hosts, hosts left
// uncompiled, components, reads of unknown kind, literals, conditionals,
// conditional spreads and generated lists, nested up to a depth; every third
// without conditions. Each is compiled with extraction on and run under every
// combination of its conditions and list lengths.
import { transform } from '@swc/core'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const WASM_PATH = path.resolve(import.meta.dirname, '../npm/meonode_swc_plugin.wasm')
const CARRIER_KEY = '__meo$r'
/** How many walks are generated, and the seed that makes them the same each run. */
const CASES = 800
const SEED = 4
/** The boolean reads conditions are made of. */
const FLAGS = ['a', 'b', 'c'] as const
/** The lengths a generated list is run with. */
const LENGTHS = [0, 1, 2]
/** How deep hosts nest inside a walk. */
const DEPTH = 2
/** Every how many walks one is written without conditions, where the marks must be exact. */
const PLAIN_EVERY = 3

interface Case {
  source: string
  /** Whether the walk has a condition, spread or list, so its marks may be a superset. */
  conditional: boolean
}

function generator(seed: number) {
  let state = seed
  const next = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]
  let id = 0
  let conditional = false
  /** Whether the walk being written may hold conditions, spreads and lists. */
  let conditions = true
  let count = 0
  const flag = () => `s.${pick(FLAGS)}`
  /**
   * A host's style props: named (static), a `css` the compiler cannot read
   * (a style on some renders, empty on others), both, or none.
   */
  const style = () => pick(['padding: 1, ', 'color: "red", ', 'css: s.css, ', 'css: s.css, ', 'padding: 1, css: s.css, ', ''])
  const host = (depth: number): string => {
    const n = id++
    const kids = depth < DEPTH && next() < 0.5 ? `, children: [${children(depth + 1, 1 + Math.floor(next() * 3)).join(', ')}]` : ''
    return `Div({ ${style()}'data-i': ${n}${kids} })`
  }
  const child = (depth: number): string => {
    const r = next()
    if (r < 0.4) return host(depth)
    if (r < 0.55) return `Node(Card, { 'data-i': ${id++} })`
    if (r < 0.62) return `s.u${id++}`
    if (r < 0.64) return 'Div(s.loose)'
    if (r < 0.67 || !conditions) return r < 0.67 ? pick(['"text"', 'null']) : host(depth)
    conditional = true
    if (r < 0.8) return `${flag()} ? ${child(depth)} : ${child(depth)}`
    return `${flag()} && ${child(depth)}`
  }
  const children = (depth: number, count: number): string[] => {
    const out: string[] = []
    for (let i = 0; i < count; i++) {
      const r = conditions ? next() : 1
      if (r < 0.12) {
        conditional = true
        out.push(`...(${flag()} ? [${children(depth, 1 + Math.floor(next() * 2)).join(', ')}] : [${children(depth, Math.floor(next() * 2)).join(', ')}])`)
      } else if (r < 0.24) {
        conditional = true
        out.push(`...s.items.map(item => ${child(depth)})`)
      } else out.push(child(depth))
    }
    return out
  }
  return (): Case => {
    conditional = false
    conditions = count++ % PLAIN_EVERY !== 0
    const n = id++
    const source = `Div({ ${style()}'data-i': ${n}, children: [${children(1, 1 + Math.floor(next() * 5)).join(', ')}] })`
    return { source, conditional }
  }
}

/** A position of a render, in pre-order. */
type Token = { kind: 'start' | 'end' | 'component' } | { kind: 'named' | 'runtime' | 'plain'; id: number }

interface Built {
  kind: 'host' | 'component'
  props?: Record<string, unknown>
}

const dom = (props: Record<string, unknown> | undefined) => props?.__meo$d as Record<string, unknown> | undefined
const idOf = (props: Record<string, unknown> | undefined): number => (props?.['data-i'] ?? dom(props)?.['data-i']) as number

/** Whether a `css` value holds a style, which makes the runtime render through `StyledRenderer`. */
const styled = (css: unknown) => css != null && typeof css === 'object' && Object.keys(css).length > 0

/** What a host renders as on this render: through `StyledRenderer` (runtime), from a named style, or with no style. */
function hostKind(props: Record<string, unknown>): 'named' | 'runtime' | 'plain' {
  if ('__meo$' in props) return '__meo$c' in props || styled(props.css) ? 'runtime' : '__meo$n' in props || '__meo$t' in props ? 'named' : 'plain'
  return styled(props.css) || 'padding' in props || 'color' in props ? 'runtime' : 'plain'
}

/** The render's positions, in pre-order. */
function tokens(value: unknown, out: Token[] = []): Token[] {
  if (Array.isArray(value)) {
    for (const v of value) tokens(v, out)
    return out
  }
  if (value === null || typeof value !== 'object') return out
  const built = value as Built
  if (built.kind === 'component') {
    out.push({ kind: 'component' })
    return out
  }
  const props = built.props ?? {}
  out.push({ kind: hostKind(props), id: idOf(props) })
  tokens(props.children ?? dom(props)?.children, out)
  return out
}

/** The named nodes this render needs a carrier at. */
function needed(sequence: Token[]): Set<number> {
  const out = new Set<number>()
  sequence.forEach((token, i) => {
    if (token.kind !== 'named') return
    const before = sequence.slice(0, i).reverse().find(t => t.kind !== 'plain')
    if (before?.kind !== 'start' && before?.kind !== 'component') return
    const after = sequence.slice(i + 1).find(t => t.kind !== 'plain' && t.kind !== 'named')
    if (after?.kind === 'component' || after?.kind === 'end') out.add(token.id)
  })
  return out
}

/** Ids of the hosts in a render carrying the mark, and of those named. */
function marks(value: unknown, out = { marked: new Set<number>(), named: new Set<number>() }) {
  if (Array.isArray(value)) {
    for (const v of value) marks(v, out)
    return out
  }
  if (value === null || typeof value !== 'object' || (value as Built).kind !== 'host') return out
  const props = (value as Built).props ?? {}
  if (CARRIER_KEY in props) out.marked.add(idOf(props))
  if (hostKind(props) === 'named') out.named.add(idOf(props))
  marks(props.children ?? dom(props)?.children, out)
  return out
}

describe('the carrier mark over generated walks', async () => {
  const generate = generator(SEED)
  const cases = Array.from({ length: CASES }, generate)
  const module = `import { Div, Node } from '@meonode/ui'\nconst Card = () => null\nexport const cases = [\n${cases.map(c => `  s => ${c.source},`).join('\n')}\n]\n`
  const { code } = await transform(module, {
    filename: 'carriers.js',
    jsc: { target: 'es2022', parser: { syntax: 'ecmascript' }, experimental: { plugins: [[WASM_PATH, { experimental_extractCss: true }]] } },
  })
  // Every binding the compiled module imports, as a stub: the factories build
  // plain objects, the registration helpers do nothing.
  const imported = [...code.matchAll(/import \{([^}]*)\} from "@meonode\/ui"/g)].flatMap(m => m[1].split(',').map(s => s.trim().split(/\s+as\s+/).at(-1)!))
  const stubs: Record<string, unknown> = {
    Div: (props?: Record<string, unknown>): Built => ({ kind: 'host', props }),
    Node: (): Built => ({ kind: 'component' }),
  }
  const names = [...new Set(['Div', 'Node', ...imported])]
  const body = code.replace(/^import .*$/gm, '').replace('export const cases =', 'return')
  const compiled = new Function(...names, body)(...names.map(n => stubs[n] ?? ((...args: unknown[]) => String(args.at(-1))))) as ((s: Record<string, unknown>) => unknown)[]

  /** Every render of a case: each combination of flags and list length. */
  const renders = (i: number) =>
    Array.from({ length: 2 ** FLAGS.length }, (_, combo) => combo).flatMap(combo =>
      LENGTHS.map(length => {
        const s: Record<string, unknown> = Object.fromEntries(FLAGS.map((flag, bit) => [flag, Boolean(combo & (1 << bit))]))
        // A style on some renders and none on others.
        s.css = s.c ? { margin: 1 } : undefined
        s.items = Array.from({ length }, (_, k) => k)
        // The props of a host the compiler leaves to the runtime.
        s.loose = s.b ? { css: { margin: 1 } } : {}
        // Every read of unknown kind (`s.u<id>`) is a component.
        return compiled[i](new Proxy(s, { get: (target, key) => (typeof key === 'string' && /^u\d+$/.test(key) ? { kind: 'component' } : target[key as string]) }))
      }),
    )

  it('compiles every case, and generates walks with and without conditions that need carriers', () => {
    expect(compiled).toHaveLength(CASES)
    const needing = cases.map((_, i) => renders(i).some(r => needed([{ kind: 'start' }, ...tokens(r), { kind: 'end' }]).size > 0))
    expect(cases.filter((c, i) => c.conditional && needing[i]).length).toBeGreaterThan(CASES / 5)
    expect(cases.filter((c, i) => !c.conditional && needing[i]).length).toBeGreaterThan(CASES / 20)
  })

  it.each(cases.map((c, i) => [c.source, i] as const))('%s', (_, i) => {
    const want = new Set<number>()
    const got = new Set<number>()
    const named = new Set<number>()
    for (const render of renders(i)) {
      for (const id of needed([{ kind: 'start' }, ...tokens(render), { kind: 'end' }])) want.add(id)
      const m = marks(render)
      m.marked.forEach(id => got.add(id))
      m.named.forEach(id => named.add(id))
    }
    // Every node a render needs a carrier at carries the mark.
    expect([...want].filter(id => !got.has(id)), 'unmarked').toEqual([])
    // Only named nodes carry it.
    expect([...got].filter(id => !named.has(id)), 'not named').toEqual([])
    // Without conditions there is one render, and the mark is exactly what it needs.
    if (!cases[i].conditional) expect([...got].sort()).toEqual([...want].sort())
  })
})
