// A/B two BUILDS of `@meonode/ui` against each other, for release gating.
//
// Point it at two `dist` directories:
//   BASE_DIST=/path/to/a/dist INTG_DIST=/path/to/b/dist \
//     NODE_ENV=production node --expose-gc bench/ab-timing.mjs
//
// Why the odd shape. Comparing two builds by running one bench twice charges
// whichever ran second for the first's heap and for whatever else the machine
// started doing. Alternating per ROUND is not enough either: a round is ~120ms
// and a load spike can sit entirely inside one. So A and B alternate in small
// chunks inside every sample, in A B B A order, which cancels both a linear
// drift and a spike landing on one side.
//
// This matters more than it sounds. Measured on a machine at load ~35, coarse
// alternation put the three estimators in disagreement about the SIGN of the
// difference — min +5.15%, p25 +1.80%, median -0.32% on one shape. Paired
// interleaving brought the same shape to within ±1% and made two independent
// runs agree. If the estimators disagree in sign, the run has not resolved a
// difference and should not be reported as one.
//
// Resolution is bounded by the machine. Under load ~35 this resolves about 2%;
// quiet, it will do better. `bench/ab-alloc.mjs` is the companion that load does
// not perturb.
import { JSDOM } from 'jsdom'
import { median } from './_lib.mjs'
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
  // 255 nodes per call, so a far smaller chunk keeps the sample comparable.
  deepTree: ({ Div, Span }) => () => {
    const build = (d) => (d === 0 ? Span('leaf') : Div({ padding: 2, children: [build(d - 1), build(d - 1)] }))
    return build(7)
  },
}
const CHUNK_FOR = (name) => (name === 'deepTree' ? 20 : 2000)
const WARM_FOR = (name) => (name === 'deepTree' ? 2000 : 200000)
const PAIRS = Number(process.env.PAIRS || 400)
const out = {}
for (const [name, mk] of Object.entries(shapes)) {
  const a = mk(base), b = mk(intg)
  const CHUNK = CHUNK_FOR(name)
  for (let i = 0; i < WARM_FOR(name); i++) { a(); b() }   // warm both
  const da = [], db = []
  for (let p = 0; p < PAIRS; p++) {
    if (global.gc && p % 50 === 0) global.gc()
    let t = performance.now(); for (let i = 0; i < CHUNK; i++) a(); da.push(performance.now() - t)
    t = performance.now(); for (let i = 0; i < CHUNK; i++) b(); db.push(performance.now() - t)
    t = performance.now(); for (let i = 0; i < CHUNK; i++) b(); db.push(performance.now() - t)
    t = performance.now(); for (let i = 0; i < CHUNK; i++) a(); da.push(performance.now() - t)
  }
  const mn = (x) => Math.min(...x), md = (x) => median(x)
  out[name] = {
    minDeltaPct: +(((mn(db) - mn(da)) / mn(da)) * 100).toFixed(2),
    medianDeltaPct: +(((md(db) - md(da)) / md(da)) * 100).toFixed(2),
    samples: da.length,
  }
}
console.log(JSON.stringify(out, null, 1))
