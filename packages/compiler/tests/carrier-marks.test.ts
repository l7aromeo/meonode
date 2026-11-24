// The runtime makes a named node a carrier where no rule node comes before it
// since the walk's start or a child that renders a component. The carrier mark
// `__meo$r` must be on every named node that is a carrier on some render, on the
// server or in the browser, and not on another: marked, it is one on every
// render, so its fiber's type never changes. The mark is a call site's, the same
// on every render, so over conditions it may be on more nodes than the renders
// need, but never on a node that is not named. On a walk without conditions it
// is on exactly those, and on the named nodes that would begin it: each case is
// an exported function's tree, which a caller may put after a rule.
//
// Walks are generated from named, runtime and unstyled hosts, hosts left
// uncompiled, components, reads of unknown kind, literals, conditionals,
// conditional spreads and generated lists, nested up to a depth; every third
// without conditions. Each is compiled with extraction on and run under every
// combination of its conditions and list lengths. A read of unknown kind is a
// component's element on renders where `c` holds and text on the others.
//
// Calls of imported factories are hand-written shapes: the runtime joins a
// factory's call into a named node, or calls a plain function as written, and
// only the runtime knows which. Each asserts the needed marks and the exact ones.
import { transform } from '@swc/core'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const WASM_PATH = path.resolve(import.meta.dirname, '../npm/meonode_swc_plugin.wasm')
const CARRIER_KEY = '__meo$r'
/** How many walks are generated, and the seed that makes them the same each run. */
const CASES = 800
const SEED = 4
/** How many walks with memoized hosts are generated, from the same seed. */
const MEMO_CASES = 400
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

/**
 * Walks from `seed`. With `memo`, some hosts are memoized: given `deps`, a
 * list always or a value that is `undefined` on some renders. Without it the
 * walks are the same as before memoized hosts were generated.
 */
function generator(seed: number, memo = false) {
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
    const deps = memo && next() < 0.3 ? (next() < 0.5 ? ', [s.a]' : ((conditional = true), ', s.deps')) : ''
    return `Div({ ${style()}'data-i': ${n}${kids} }${deps})`
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
  /** A host's `deps`: memoized when not `undefined`. */
  deps?: unknown
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

/** Whether a child renders a component on this render, where the runtime's walk cuts a run. */
const isComponent = (value: unknown) => value !== null && typeof value === 'object' && (value as Built).kind === 'component'

/** Whether a child is a memoized host, which the runtime's walk also cuts a run before. */
const isMemo = (value: unknown) => value !== null && typeof value === 'object' && (value as Built).kind === 'host' && (value as Built).deps !== undefined

/**
 * The render's positions, in pre-order, as one environment's walk reads them:
 * a host's child that renders a component, or a memoized one, is a cut before
 * it, as `cutsAt` finds. The server walks a memoized child inline after the
 * cut; the browser walks it on its own, so it goes to `pending` instead.
 */
function tokens(value: unknown, out: Token[], pending?: unknown[]): Token[] {
  if (Array.isArray(value)) {
    for (const v of value) tokens(v, out, pending)
    return out
  }
  if (value === null || typeof value !== 'object' || (value as Built).kind !== 'host') return out
  const props = (value as Built).props ?? {}
  out.push({ kind: hostKind(props), id: idOf(props) })
  const children = props.children ?? dom(props)?.children
  const walk = (list: unknown[]) =>
    list.forEach(child => {
      if (Array.isArray(child)) walk(child)
      else if (isComponent(child)) out.push({ kind: 'component' })
      else if (isMemo(child)) {
        out.push({ kind: 'component' })
        if (pending) pending.push(child)
        else tokens(child, out)
      } else tokens(child, out, pending)
    })
  walk(Array.isArray(children) ? children : [children])
  return out
}

/** The named nodes of a render with whether each is a carrier, on the server and in the browser. */
function neededOnEither(render: unknown): Map<number, 'start' | 'component' | false>[] {
  const out = [needed([{ kind: 'start' }, ...tokens(render, []), { kind: 'end' }])]
  // The browser's walks: the render's, then each memoized host's own, which
  // begins after the cut before it.
  const pending: unknown[] = [render]
  for (let first = true; pending.length > 0; first = false) {
    const root = pending.shift()
    out.push(needed([{ kind: first ? 'start' : 'component' }, ...tokens(root, [], pending), { kind: 'end' }]))
  }
  return out
}

/**
 * The named nodes of this render, each with whether the runtime makes it a
 * carrier: with no rule before it since the walk's start or a cut. A carrier
 * says which of the two is before it.
 */
function needed(sequence: Token[]): Map<number, 'start' | 'component' | false> {
  const out = new Map<number, 'start' | 'component' | false>()
  sequence.forEach((token, i) => {
    if (token.kind !== 'named') return
    const before = sequence
      .slice(0, i)
      .reverse()
      .find(t => t.kind !== 'plain')
    out.set(token.id, before?.kind === 'start' || before?.kind === 'component' ? before.kind : false)
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

const suite = (name: string, memo: boolean, count: number) =>
  describe(name, async () => {
    const generate = generator(SEED, memo)
    const cases = Array.from({ length: count }, generate)
    const module = `import { Div, Node } from '@meonode/ui'\nconst Card = () => null\nexport const cases = [\n${cases.map(c => `  s => ${c.source},`).join('\n')}\n]\n`
    const { code } = await transform(module, {
      filename: 'carriers.js',
      jsc: { target: 'es2022', parser: { syntax: 'ecmascript' }, experimental: { plugins: [[WASM_PATH, { experimental_extractCss: true }]] } },
    })
    // Every binding the compiled module imports, as a stub: the factories build
    // plain objects, the registration helpers do nothing.
    const imported = [...code.matchAll(/import \{([^}]*)\} from "@meonode\/ui"/g)].flatMap(m =>
      m[1].split(',').map(s =>
        s
          .trim()
          .split(/\s+as\s+/)
          .at(-1)!,
      ),
    )
    const stubs: Record<string, unknown> = {
      Div: (props?: Record<string, unknown>, deps?: unknown): Built => ({ kind: 'host', props, deps }),
      Node: (): Built => ({ kind: 'component' }),
    }
    const names = [...new Set(['Div', 'Node', ...imported])]
    const body = code.replace(/^import .*$/gm, '').replace('export const cases =', 'return')
    const compiled = new Function(...names, body)(...names.map(n => stubs[n] ?? ((...args: unknown[]) => String(args.at(-1))))) as ((
      s: Record<string, unknown>,
    ) => unknown)[]

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
          // Deps that are a list on some renders and `undefined` on others.
          s.deps = s.a ? [1] : undefined
          // A read of unknown kind (`s.u<id>`) is a component on some renders and text on others.
          return compiled[i](
            new Proxy(s, {
              get: (target, key) => (typeof key === 'string' && /^u\d+$/.test(key) ? (target.c ? { kind: 'component' } : 'text') : target[key as string]),
            }),
          )
        }),
      )

    it('compiles every case, and generates walks with and without conditions that need carriers', () => {
      expect(compiled).toHaveLength(count)
      const needing = cases.map((_, i) => renders(i).some(r => neededOnEither(r).some(walk => [...walk.values()].some(Boolean))))
      expect(cases.filter((c, i) => c.conditional && needing[i]).length).toBeGreaterThan(count / 5)
      expect(cases.filter((c, i) => !c.conditional && needing[i]).length).toBeGreaterThan(count / 20)
    })

    it.each(cases.map((c, i) => [c.source, i] as const))('%s', (_, i) => {
      // Each named node's place across renders and environments: a carrier, and
      // which cut or start is before it, or plain.
      const places = new Map<number, Set<'start' | 'component' | false>>()
      const got = new Set<number>()
      const named = new Set<number>()
      for (const render of renders(i)) {
        for (const walk of neededOnEither(render))
          for (const [id, place] of walk) {
            if (!places.has(id)) places.set(id, new Set())
            places.get(id)!.add(place)
          }
        const m = marks(render)
        m.marked.forEach(id => got.add(id))
        m.named.forEach(id => named.add(id))
      }
      // A node whose place changes, a carrier on one render or environment and
      // plain on another, needs the mark.
      const want = new Set([...places].filter(([, p]) => p.has(false) && (p.has('start') || p.has('component'))).map(([id]) => id))
      // Every node a render needs a carrier at carries the mark.
      expect(
        [...want].filter(id => !got.has(id)),
        'unmarked',
      ).toEqual([])
      // Only named nodes carry it.
      expect(
        [...got].filter(id => !named.has(id)),
        'not named',
      ).toEqual([])
      // Without conditions or reads of unknown kind (which may also be a named
      // node handed in), the mark is on exactly those, and on the nodes that would
      // begin the walk, which a caller may put after a rule.
      if (!cases[i].conditional && !cases[i].source.includes('s.u')) {
        const begins = [...places].filter(([, p]) => p.has('start')).map(([id]) => id)
        expect([...got].sort()).toEqual([...new Set([...want, ...begins])].sort())
      }
    })
  })

suite('the carrier mark over generated walks', false, CASES)
suite('the carrier mark over generated walks with memoized hosts', true, MEMO_CASES)

/**
 * Imported calls, as the runtime treats each: `X` a factory of a host, joined
 * into a named node; `XC` a factory of a component, a cut wherever it renders;
 * `F` a plain function, called as written, which returns a component's element
 * where `a` holds and an uncompiled host elsewhere.
 */
const FACTORY_CASES: { name: string; source: string; helpers?: string; marks: number[] }[] = [
  {
    name: 'a factory call after a plain function, among a factory call’s children',
    source: `X({ 'data-i': 0, padding: 1, children: [F({ 'data-i': 1, s }), X({ 'data-i': 2, padding: 2 })] }).render()`,
    marks: [2],
  },
  {
    name: 'a factory call after a plain function, among a host’s children',
    source: `Div({ 'data-i': 0, padding: 1, children: [F({ 'data-i': 1, s }), X({ 'data-i': 2, padding: 2 })] }).render()`,
    marks: [2],
  },
  {
    // Either call may be a plain function, which only the runtime knows.
    name: 'a factory call after another factory call',
    source: `X({ 'data-i': 0, padding: 1, children: [X({ 'data-i': 1, padding: 3 }), X({ 'data-i': 2, padding: 2 })] }).render()`,
    marks: [2],
  },
  {
    // The first follows the host's rule on every render, whatever it renders.
    name: 'factory calls first among a host’s children',
    source: `Div({ 'data-i': 0, padding: 1, children: [X({ 'data-i': 1, color: 'blue' }), X({ 'data-i': 2, fontSize: 12 })] }).render()`,
    marks: [2],
  },
  {
    name: 'a factory of a component first among a host’s children',
    source: `Div({ 'data-i': 0, padding: 1, children: [XC({ 'data-i': 1, color: 'blue' }), Div({ 'data-i': 2, color: 'red' })] }).render()`,
    marks: [2],
  },
  {
    // A cut before it on both sides: first on every render. Each node after a
    // child that may be absent has a key, so its position is its own.
    name: 'a memoized factory call after a rule on some renders',
    source: `Div({ 'data-i': 0, children: [s.a ? Div({ 'data-i': 1, css: s.css }) : null, X({ key: 'm', 'data-i': 2, padding: 1 }, [s.b])] }).render()`,
    marks: [],
  },
  {
    name: 'a factory call with deps on some renders, after a rule on some renders',
    source: `Div({ 'data-i': 0, children: [s.a ? Div({ 'data-i': 1, css: s.css }) : null, X({ key: 'm', 'data-i': 2, padding: 1 }, s.deps)] }).render()`,
    marks: [2],
  },
  {
    name: 'a factory call after a rule on some renders, with no deps',
    source: `Div({ 'data-i': 0, children: [s.a ? Div({ 'data-i': 1, css: s.css }) : null, X({ key: 'm', 'data-i': 2, padding: 1 })] }).render()`,
    marks: [2],
  },
  {
    // Its walk begins at it.
    name: 'a factory call `.render()` is called on',
    source: `X({ 'data-i': 0, padding: 1, children: [s.a ? Div({ 'data-i': 1, css: s.css }) : null, 'x'] }).render()`,
    marks: [],
  },
  {
    // Callers in other modules may put anything before its root.
    name: 'the factory call an exported helper returns',
    helpers: `export function part() { return X({ 'data-i': 1, padding: 1 }) }`,
    source: `Div({ 'data-i': 0, padding: 1, children: [part()] }).render()`,
    marks: [1],
  },
  {
    // Every caller is in the module and puts a rule before it.
    name: 'the factory call a helper returns under a rule',
    helpers: `function inner() { return X({ 'data-i': 1, padding: 1 }) }`,
    source: `Div({ 'data-i': 0, padding: 1, children: [inner()] }).render()`,
    marks: [],
  },
]

describe('the carrier mark on calls of imported factories', async () => {
  const module = `import { Div, Node } from '@meonode/ui'\nimport { X, XC, F } from './nodes'\nconst Card = () => null\n${FACTORY_CASES.map(c => c.helpers ?? '').join('\n')}\nexport const cases = [\n${FACTORY_CASES.map(c => `  s => ${c.source},`).join('\n')}\n]\n`
  const { code } = await transform(module, {
    filename: 'factories.js',
    jsc: { target: 'es2022', parser: { syntax: 'ecmascript' }, experimental: { plugins: [[WASM_PATH, { experimental_extractCss: true }]] } },
  })
  /** A built node that `.render()` returns as it is. */
  const built = (node: Built): Built => Object.assign(node, { render: () => node })
  const X = { factory: 'host' }
  const XC = { factory: 'component' }
  const F = (props: Record<string, unknown>): Built =>
    (props.s as { a: boolean }).a ? { kind: 'component' } : built({ kind: 'host', props: { padding: 3, 'data-i': props['data-i'] } })
  /** The runtime's join: a host factory's call becomes the named node its site describes, its mark the site's. */
  const __meoFactoryCall = (callee: unknown, site: { at: number; r?: 1 }, ...args: unknown[]): unknown => {
    if (callee === X) {
      const props = (args[site.at] ?? {}) as Record<string, unknown>
      return built({ kind: 'host', props: { ...props, __meo$: 2, __meo$n: 'joined', ...(site.r ? { [CARRIER_KEY]: 1 } : {}) }, deps: args[site.at + 1] })
    }
    if (callee === XC) return built({ kind: 'component' })
    return (callee as (...a: unknown[]) => unknown)(...args)
  }
  const stubs: Record<string, unknown> = {
    Div: (props?: Record<string, unknown>, deps?: unknown): Built => built({ kind: 'host', props, deps }),
    Node: (): Built => built({ kind: 'component' }),
    X,
    XC,
    F,
    __meoFactoryCall,
  }
  const imported = [...code.matchAll(/import \{([^}]*)\} from "@meonode\/ui"/g)].flatMap(m => m[1].split(',').map(s => s.trim().split(/\s+as\s+/).at(-1)!))
  const names = [...new Set([...Object.keys(stubs), ...imported])]
  const body = code.replace(/^import .*$/gm, '').replace('export const cases =', 'return').replace(/^export /gm, '')
  const compiled = new Function(...names, body)(...names.map(n => stubs[n] ?? (() => undefined))) as ((s: Record<string, unknown>) => unknown)[]

  it.each(FACTORY_CASES.map((c, i) => [c.name, i] as const))('%s', (_, i) => {
    const places = new Map<number, Set<'start' | 'component' | false>>()
    const got = new Set<number>()
    const named = new Set<number>()
    for (const combo of Array.from({ length: 2 ** FLAGS.length }, (_, k) => k)) {
      const s: Record<string, unknown> = Object.fromEntries(FLAGS.map((flag, bit) => [flag, Boolean(combo & (1 << bit))]))
      s.css = s.c ? { margin: 1 } : undefined
      s.deps = s.a ? [1] : undefined
      const render = compiled[i](s)
      for (const walk of neededOnEither(render))
        for (const [id, place] of walk) {
          if (!places.has(id)) places.set(id, new Set())
          places.get(id)!.add(place)
        }
      const m = marks(render)
      m.marked.forEach(id => got.add(id))
      m.named.forEach(id => named.add(id))
    }
    const want = [...places].filter(([, p]) => p.has(false) && (p.has('start') || p.has('component'))).map(([id]) => id)
    expect(
      want.filter(id => !got.has(id)),
      'unmarked',
    ).toEqual([])
    expect(
      [...got].filter(id => !named.has(id)),
      'not named',
    ).toEqual([])
    expect([...got].sort()).toEqual(FACTORY_CASES[i].marks)
  })
})
