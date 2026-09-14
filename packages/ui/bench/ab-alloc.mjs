// Bytes allocated per construction, for two BUILDS of `@meonode/ui`.
//
//   BASE_DIST=/path/to/a/dist INTG_DIST=/path/to/b/dist \
//     NODE_ENV=production node --expose-gc bench/ab-alloc.mjs
//
// The companion to `ab-timing.mjs`, and the more trustworthy of the two on a
// busy machine: CPU contention moves timings around and leaves allocation
// alone. Results are retained in an array during measurement so nothing is
// collected mid-run, and the median of five runs is reported.
//
// A claim like "the common path allocates nothing" is answerable here and only
// arguable from a stopwatch.
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.window = dom.window; globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
const base = await import(`${process.env.BASE_DIST}/esm/main.js`)
const intg = await import(`${process.env.INTG_DIST}/esm/main.js`)
const shapes = {
  flatChildren: ({ Div, Span }) => () => Div({ padding: 8, children: [Span('a'), Span('b'), Span('c'), Span('d'), Span('e')] }),
  singleChild: ({ Div, Span }) => () => Div({ padding: 8, children: Span('only') }),
  propsOnly: ({ Div }) => () => Div({ padding: 8, margin: 4, color: '#333', display: 'flex' }),
  nestedArray: ({ Div, Span }) => () => Div({ padding: 8, children: [Span('h'), [Span('a'), Span('b'), Span('c')]] }),
}
const N = 20000
const bytesPer = (fn) => {
  for (let i = 0; i < 5000; i++) fn()          // warm, let shapes stabilise
  global.gc(); global.gc()
  const before = process.memoryUsage().heapUsed
  const sink = new Array(N)
  for (let i = 0; i < N; i++) sink[i] = fn()   // retain, so nothing is collected mid-measure
  const after = process.memoryUsage().heapUsed
  if (sink.length !== N) throw new Error('unreachable')
  return (after - before) / N
}
const med = (xs) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)]

// PAIRED differences, not a difference of medians.
//
// Differencing the two medians looked equivalent and is not: each `bytesPer`
// call leaves the heap in a different state for the next one, so A and B sit at
// systematically different points in that drift. Validated by pointing both
// sides at the SAME dist, where the answer must be 0 — difference-of-medians
// reported a reproducible -26.4 B on flatChildren and +13.7 B on singleChild,
// stable to 0.1 B across runs. Pairing each A with the B measured beside it
// cancels the drift and returns that self-comparison to ~0.
//
// Always run the self-comparison before trusting a result from this file:
//   BASE_DIST=X INTG_DIST=X node --expose-gc bench/ab-alloc.mjs
const out = {}
for (const [name, mk] of Object.entries(shapes)) {
  const a = mk(base)
  const b = mk(intg)
  const diffs = []
  const aVals = []
  for (let r = 0; r < 7; r++) {
    // A B B A, so a monotonic drift cancels within the pair.
    const a1 = bytesPer(a), b1 = bytesPer(b), b2 = bytesPer(b), a2 = bytesPer(a)
    diffs.push((b1 + b2) / 2 - (a1 + a2) / 2)
    aVals.push((a1 + a2) / 2)
  }
  const A = med(aVals)
  const delta = med(diffs)
  out[name] = { mainBytes: +A.toFixed(1), deltaBytes: +delta.toFixed(1), deltaPct: +((delta / A) * 100).toFixed(2) }
}
console.log(JSON.stringify(out, null, 1))
