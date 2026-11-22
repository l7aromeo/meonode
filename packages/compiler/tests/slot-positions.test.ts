// The slot marker `__meo$p` must name, at run time, the positions of a host
// call site's children that may render something other than a host the runtime
// walks, and its paths must be the same whatever the children's conditions
// hold: the runtime places a leaf or `null` at each, and a set that changed
// with a condition would pair the unkeyed siblings after it differently from
// an uncompiled render.
//
// So every such position before the first spread is marked, and so is the
// spread's own index when its first item may be one; nothing inside or after
// the spread is. Children are generated: hosts, components, reads of unknown
// kind, holes, nested array literals, conditional spreads over array
// literals, and spreads of reads and calls. Each case is compiled with
// extraction on and run under every combination of its conditions.
import { transform } from '@swc/core'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const WASM_PATH = path.resolve(import.meta.dirname, '../npm/meonode_swc_plugin.wasm')
const SLOTS_KEY = '__meo$p'
/** How many cases are generated, and the seed that makes them the same each run. */
const CASES = 400
const SEED = 152
/** The boolean reads the conditions are made of. */
const FLAGS = ['a', 'b', 'c'] as const

/** A child as the runtime sees it, from the stub factories and reads. */
interface Leaf {
  kind: 'host' | 'component' | 'unknown'
  id: number
}

/** A generated case: its children source, and the marker's paths as the rule gives them. */
interface Case {
  source: string
  /** Ids of the leaves written before the first spread. */
  before: Set<number>
  /** The first spread's written index, when its first item may need a slot. */
  start: number | undefined
}

/** Items joined as an array literal's contents; a trailing hole keeps its comma, or it is no item at all. */
const list = (items: readonly string[]): string => items.join(', ') + (items.at(-1) === '' ? ',' : '')

function generator(seed: number) {
  let state = seed
  const next = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]
  let id = 0
  const test = () => pick([`s.${pick(FLAGS)}`, `!s.${pick(FLAGS)}`, `s.${pick(FLAGS)} && s.${pick(FLAGS)}`, `s.f()`])
  /** A leaf as written, and whether it is a walked host (a host call or a literal) or a hole. */
  const leaf = (ids: Set<number> | undefined): { text: string; walked: boolean; hole: boolean } => {
    const n = id++
    ids?.add(n)
    // An empty item is a hole: `undefined`, which takes a position.
    return pick([
      { text: `Div({ 'data-i': ${n} })`, walked: true, hole: false },
      { text: `Node(Card, { 'data-i': ${n} })`, walked: false, hole: false },
      { text: `s.u${n}`, walked: false, hole: false },
      { text: 'null', walked: true, hole: false },
      { text: '', walked: true, hole: true },
    ])
  }
  /**
   * Items, some of them nested array literals: `first` tells whether the first
   * may need a slot, and `walked` whether every item is walked.
   */
  const items = (count: number, ids: Set<number> | undefined, nested: boolean) => {
    const out: string[] = []
    let first: boolean | undefined
    let walked = true
    for (let i = 0; i < count; i++) {
      if (nested && next() < 0.2) {
        // A nested array literal is walked when every item in it is.
        const inner = items(1 + Math.floor(next() * 2), ids, false)
        out.push(`[${list(inner.out)}]`)
        first ??= !inner.walked
        walked &&= inner.walked
      } else {
        const l = leaf(ids)
        out.push(l.text)
        first ??= l.hole || !l.walked
        walked &&= l.walked
      }
    }
    return { out, first: first ?? false, walked }
  }
  return (): Case => {
    const before = new Set<number>()
    let start: number | undefined
    let spread = false
    const children: string[] = []
    const length = 1 + Math.floor(next() * 5)
    for (let i = 0; i < length; i++) {
      const r = next()
      if (r < 0.45) {
        const ids = undefined
        let first: boolean
        if (next() < 0.75) {
          const cons = items(Math.floor(next() * 3), ids, true)
          const alt = items(Math.floor(next() * 3), ids, true)
          children.push(`...(${test()} ? [${list(cons.out)}] : [${list(alt.out)}])`)
          first = cons.first || alt.first
        } else {
          children.push(next() < 0.5 ? `...s.rows` : `...s.list()`)
          first = true
        }
        if (!spread && first) start = children.length - 1
        spread = true
      } else {
        children.push(...items(1, spread ? undefined : before, true).out)
      }
    }
    return { source: `Div({ children: [${list(children)}] })`, before, start }
  }
}

/** Paths of the children that are not hosts, through nested arrays. */
function leafPaths(children: unknown[], prefix: number[] = []): { path: number[]; id: number }[] {
  return children.flatMap((child, i) => {
    if (Array.isArray(child)) return leafPaths(child, [...prefix, i])
    const leaf = child as Leaf | null | undefined
    return leaf == null || leaf.kind === 'host' ? [] : [{ path: [...prefix, i], id: leaf.id }]
  })
}

const idOf = (props: Record<string, unknown> | undefined): number =>
  (props?.['data-i'] ?? (props?.__meo$d as Record<string, unknown> | undefined)?.['data-i']) as number

describe('the slot marker over generated children', async () => {
  const generate = generator(SEED)
  const cases = Array.from({ length: CASES }, generate)
  const module = `import { Div, Node } from '@meonode/ui'\nconst Card = () => null\nexport const cases = [\n${cases.map(c => `  s => ${c.source},`).join('\n')}\n]\n`
  const { code } = await transform(module, {
    filename: 'slots.js',
    jsc: { target: 'es2022', parser: { syntax: 'ecmascript' }, experimental: { plugins: [[WASM_PATH, { experimental_extractCss: true }]] } },
  })
  const body = code.replace(/^import .*$/gm, '').replace('export const cases =', 'return')
  const Div = (props?: Record<string, unknown>) => ({ kind: 'host', id: idOf(props), props })
  const Node = (_: unknown, props?: Record<string, unknown>) => ({ kind: 'component', id: idOf(props) })
  const compiled = new Function('Div', 'Node', body)(Div, Node) as ((s: Record<string, unknown>) => { props: Record<string, unknown> })[]

  it('compiles every case, and generates spreads that need a start slot and spreads that need none', () => {
    expect(compiled).toHaveLength(CASES)
    expect(cases.filter(c => c.start !== undefined).length).toBeGreaterThan(CASES / 10)
    expect(cases.filter(c => c.source.includes('...') && c.start === undefined).length).toBeGreaterThan(CASES / 20)
  })

  it.each(cases.map((c, i) => [c.source, i] as const))('%s', (_, i) => {
    const markers = new Set<string>()
    for (let combo = 0; combo < 2 ** FLAGS.length; combo++) {
      const s: Record<string, unknown> = Object.fromEntries(FLAGS.map((flag, bit) => [flag, Boolean(combo & (1 << bit))]))
      s.f = () => s.a
      s.rows = [{ kind: 'unknown', id: -1 }]
      s.list = () => (s.b ? [] : [{ kind: 'unknown', id: -1 }])
      for (let n = 0; n < 10_000; n++) s[`u${n}`] = { kind: 'unknown', id: n }
      const { props } = compiled[i](s)
      const children = (props.children ?? (props.__meo$d as Record<string, unknown>)?.children) as unknown[]
      const want = leafPaths(children)
        .filter(leaf => cases[i].before.has(leaf.id))
        .map(leaf => JSON.stringify(leaf.path))
      if (cases[i].start !== undefined) want.push(JSON.stringify([cases[i].start]))
      const marker = (props[SLOTS_KEY] ?? []) as (number | number[])[]
      const got = marker.map(p => JSON.stringify(typeof p === 'number' ? [p] : p))
      expect(got.sort(), `combo ${combo}`).toEqual(want.sort())
      markers.add(JSON.stringify(marker))
    }
    // The same paths under every condition.
    expect(markers.size).toBe(1)
  })
})
