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
// THE RULE THIS HARNESS IS BUILT AROUND: a comparison needs a control that would
// have shown dirt. Every measurement here can succeed for a reason unrelated to
// the thing being measured, and nothing in a clean-looking result says so. Three
// times that has happened and each time only a control caught it:
//
//   1. `ab-alloc.mjs` differenced medians and read -26.4 B comparing a build to
//      ITSELF, reproducible to 0.1 B. Caught by a throwaway self-comparison, not
//      by the result looking wrong. It now pairs differences.
//   2. `propsOnly` — a shape the change under test cannot even execute — carried
//      a consistent +1.5% over two runs and died on the third. The control was
//      noticing that the code cannot run there.
//   3. Within-round drift, which is why the block below exists: positions 1 and
//      4 of the A B B A interleave are the same build in the same process, and
//      one run had them 7-24% apart. Its medians looked like an ordinary noisy
//      result. Without this control they would have been reported as one.
//
// So: run the self-comparison (BASE_DIST === INTG_DIST) before trusting any real
// comparison, and treat a shape whose delta is inside this run's own resolution
// as unresolved rather than as a small effect.
//
// Resolution is bounded by the machine. Under load ~35 this resolves about 2%;
// quiet, it will do better — but `nestedArray` has read -1.1% against itself on
// a quiet box, reproducibly, so that shape carries a bias of its own and cannot
// be measured here at the size the release changes it by. `bench/ab-alloc.mjs`
// is the companion that load does not perturb.
//
// Exit status is 1 when any shape did not resolve. Those shapes report no
// numbers at all, on purpose: a figure printed beside a caveat travels without
// the caveat.
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
// Above this, within-round drift is not a resolution limit but evidence the
// process was doing something other than the benchmark. Measured: a healthy run
// sits at 0.1-1.3%; the run that prompted this guard sat at 7-24%.
const DRIFT_CEILING = Number(process.env.DRIFT_CEILING || 2)
const out = {}
for (const [name, mk] of Object.entries(shapes)) {
  const a = mk(base), b = mk(intg)
  const CHUNK = CHUNK_FOR(name)
  for (let i = 0; i < WARM_FOR(name); i++) { a(); b() }   // warm both
  const da = [], db = [], drift = []
  for (let p = 0; p < PAIRS; p++) {
    if (global.gc && p % 50 === 0) global.gc()
    let t = performance.now(); for (let i = 0; i < CHUNK; i++) a(); const a1 = performance.now() - t
    da.push(a1)
    t = performance.now(); for (let i = 0; i < CHUNK; i++) b(); db.push(performance.now() - t)
    t = performance.now(); for (let i = 0; i < CHUNK; i++) b(); db.push(performance.now() - t)
    t = performance.now(); for (let i = 0; i < CHUNK; i++) a(); const a2 = performance.now() - t
    da.push(a2)
    // Positions 1 and 4 are the same build in the same process. Whatever
    // separates them is drift, not a difference between builds, and it bounds
    // what this run can resolve.
    drift.push(((a2 - a1) / a1) * 100)
  }
  const mn = (x) => Math.min(...x), md = (x) => median(x)
  // Two different things go wrong inside a round, and only one of them is a
  // slope. `md(drift)` is the systematic part — position 4 consistently cheaper
  // than position 1 — and it is what blew up to 7-24% in the run that prompted
  // this. `md(|drift|)` is the scale of the positional wobble whatever its sign,
  // and it is the one that bounds resolution: A sits at positions 1 and 4 while
  // B sits at 2 and 3, so anything that is not linear in position lands on one
  // side and not the other. Measured: with the scale at 3-4% a self-comparison
  // still produced per-shape medians of -3.25% and -2.25% on identical builds,
  // which is precisely the size of result this gate exists to not report.
  const drag = Math.abs(md(drift))
  const resolution = md(drift.map(Math.abs))
  const minDeltaPct = +(((mn(db) - mn(da)) / mn(da)) * 100).toFixed(2)
  const medianDeltaPct = +(((md(db) - md(da)) / md(da)) * 100).toFixed(2)
  out[name] =
    drag > DRIFT_CEILING
      ? { unreadable: `within-round drift ${drag.toFixed(2)}% exceeds the ${DRIFT_CEILING}% ceiling`, samples: da.length }
      : Math.abs(medianDeltaPct) <= resolution
        ? { unreadable: `below this run's resolution of ${resolution.toFixed(2)}%`, samples: da.length }
        : { minDeltaPct, medianDeltaPct, resolutionPct: +resolution.toFixed(2), samples: da.length }
}
console.log(JSON.stringify(out, null, 1))
const unreadable = Object.entries(out).filter(([, v]) => v.unreadable)
if (unreadable.length) {
  console.error(`\n${unreadable.length} of ${Object.keys(out).length} shapes did not resolve:`)
  for (const [name, v] of unreadable) console.error(`  ${name}: ${v.unreadable}`)
  console.error('\nNo median is reported for those, deliberately: a number beside a caveat gets quoted without it.')
  process.exitCode = 1
}
