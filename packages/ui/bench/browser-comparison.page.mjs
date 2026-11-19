// Runs inside the browser, bundled by `browser-comparison.mjs` from an entry
// that calls `start` with the MeoNode builds to compare. Mounts the same shape
// on every side and reports median mount times and fiber counts, then times
// updates that change a styled value on every render. Each case is timed two
// ways: JavaScript only (building the tree plus React's render and commit), and
// to the frame (the same, plus the browser's style, layout and paint of the
// first frame that shows the commit).
import { jsx } from '@emotion/react'
import { createElement, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { appOf, flatThemedOf } from './browser-comparison.app.mjs'

/** One style property, the same on every side that styles. */
const PADDING = { padding: '1px' }

/**
 * The rules behind the classes the className sides set, the same styles the
 * styled sides write. Without them a className side would skip style and
 * layout work that the styled sides pay for in every frame. `.list` lays the
 * flat shape out as rows, as a list renders: inline spans with no space
 * between them would form one unbroken word, whose layout grows with the square
 * of the node count and would swamp the frame time.
 */
const CLASS_RULES =
  '.list > * { display: block } .c { padding: 1px } .ok { color: green } .error { color: red } .valid { border-color: green } .invalid { border-color: red }'

/** A controlled input's change handler; the benchmark sets the value itself. */
const ignoreChange = () => {}

/**
 * React's two sides. `reactClass` is the baseline: React setting a static
 * class, with no CSS-in-JS. `reactEmotion` is what Emotion's own css prop costs.
 *
 * Each side has `leaf` and `wrap` for the mount shapes, and `updates`, which
 * map `tick`, the update count, and `n` to the tree of each update case:
 * - `rows`: `n` rows coloured by whether each is flagged; every update flips
 *   every row. React switches a className, Emotion and MeoNode styled write the
 *   colour as a style, and MeoNode with a className switches a className.
 * - `input`: a controlled input whose value changes on every update; its border
 *   colour shows whether the value is long enough.
 */
const REACT_SIDES = {
  reactClass: {
    leaf: (key, text) => createElement('span', { key, className: 'c' }, text),
    wrap: child => createElement('div', { className: 'c' }, child),
    updates: {
      rows: (tick, n) =>
        createElement(
          'div',
          null,
          Array.from({ length: n }, (_, i) => createElement('div', { key: i, className: (i + tick) % 2 ? 'error' : 'ok' }, `row ${i}`)),
        ),
      input: tick => createElement('input', { value: 'x'.repeat(tick % 8), onChange: ignoreChange, className: tick % 8 < 3 ? 'invalid' : 'valid' }),
    },
  },
  reactEmotion: {
    leaf: (key, text) => jsx('span', { key, css: PADDING }, text),
    wrap: child => jsx('div', { css: PADDING }, child),
    updates: {
      rows: (tick, n) =>
        createElement(
          'div',
          null,
          Array.from({ length: n }, (_, i) => jsx('div', { key: i, css: { color: (i + tick) % 2 ? 'red' : 'green' } }, `row ${i}`)),
        ),
      input: tick => jsx('input', { value: 'x'.repeat(tick % 8), onChange: ignoreChange, css: { borderColor: tick % 8 < 3 ? 'red' : 'green' } }),
    },
  },
}

/**
 * MeoNode's two sides for one build of `@meonode/ui`: `meoStyled` is MeoNode
 * on top of Emotion, `meoClassName` is MeoNode setting the baseline's static
 * class, with no CSS-in-JS.
 * @param lib The build's exports.
 * @param suffix Appended to the side names, to tell builds apart.
 */
function meonodeSides({ Div, Input, Span }, suffix) {
  return {
    [`meoStyled${suffix}`]: {
      leaf: (key, text) => Span(text, { key, ...PADDING }),
      wrap: child => Div({ ...PADDING, children: child }),
      meonode: true,
      updates: {
        rows: (tick, n) =>
          Div({ children: Array.from({ length: n }, (_, i) => Div({ key: i, color: (i + tick) % 2 ? 'red' : 'green', children: `row ${i}` })) }).render(),
        input: tick => Input({ value: 'x'.repeat(tick % 8), onChange: ignoreChange, borderColor: tick % 8 < 3 ? 'red' : 'green' }).render(),
      },
    },
    [`meoClassName${suffix}`]: {
      leaf: (key, text) => Span(text, { key, className: 'c' }),
      wrap: child => Div({ className: 'c', children: child }),
      meonode: true,
      updates: {
        rows: (tick, n) =>
          Div({ children: Array.from({ length: n }, (_, i) => Div({ key: i, className: (i + tick) % 2 ? 'error' : 'ok', children: `row ${i}` })) }).render(),
        input: tick => Input({ value: 'x'.repeat(tick % 8), onChange: ignoreChange, className: tick % 8 < 3 ? 'invalid' : 'valid' }).render(),
      },
    },
  }
}

/** The sides of this page, set by {@link start}. */
let SIDES = {}

function build(side, shape, n) {
  const { leaf, wrap, meonode } = SIDES[side]
  if (shape === 'flat') {
    const children = Array.from({ length: n }, (_, i) => leaf(i, `n${i}`))
    return meonode ? SIDES[side].lib.Div({ className: 'list', children }).render() : createElement('div', { className: 'list' }, children)
  }
  let node = leaf(undefined, 'leaf')
  for (let i = 0; i < n; i++) node = wrap(node)
  return meonode ? node.render() : node
}

/** Fibers under the root, read from React's internal container key. */
function countFibers(host) {
  const container = host[Object.keys(host).find(key => key.startsWith('__reactContainer$'))]
  let count = 0
  const walk = fiber => {
    for (; fiber; fiber = fiber.sibling) {
      count++
      walk(fiber.child)
    }
  }
  walk(container.stateNode.current.child)
  return count
}

/** Mounts one tree and counts its fibers. */
function countMountedFibers(tree) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  flushSync(() => root.render(tree))
  const fibers = countFibers(host)
  flushSync(() => root.unmount())
  host.remove()
  return fibers
}

const median = xs => {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/**
 * Shortest time one JavaScript-only sample may take, in ms. `performance.now()`
 * is coarsened (to 5 µs with cross-origin isolation, 100 µs without), so each
 * sample times enough consecutive mounts or updates to last at least this long.
 */
const MIN_SAMPLE_MS = 20

/** A quarter more than {@link MIN_SAMPLE_MS}, since a mount's time varies between samples. */
const SAMPLE_MARGIN = 1.25

/** How long a frame may take to arrive before its sample is given up as hidden, in ms. */
const FRAME_TIMEOUT_MS = 2000

/** Visibility changes seen so far; a sample during which this moves is invalid. */
let visibilityChanges = 0
document.addEventListener('visibilitychange', () => visibilityChanges++)

/**
 * Starts watching one sample. The returned function, called when the sample
 * ends, tells whether it is valid: the page was visible at both ends and its
 * visibility never changed in between. A hidden page has its timers and frames
 * throttled, so such a sample is not counted. Focus is recorded but does not
 * invalidate a sample.
 * @returns {() => { valid: boolean, visibility: string, focused: boolean }}
 */
function watchSample() {
  const visibleAtStart = document.visibilityState === 'visible'
  const focusedAtStart = document.hasFocus()
  const changes = visibilityChanges
  return () => ({
    valid: visibleAtStart && document.visibilityState === 'visible' && visibilityChanges === changes,
    visibility: document.visibilityState,
    focused: focusedAtStart && document.hasFocus(),
  })
}

/** Calls `fn` in a new task, after everything already queued. */
function nextTask(fn) {
  const { port1, port2 } = new window.MessageChannel()
  port1.onmessage = () => {
    port1.close()
    fn()
  }
  port2.postMessage(null)
}

/** Resolves once the next frame has been rendered, so earlier DOM changes are no longer pending. */
const afterFrame = () => new Promise(resolve => window.requestAnimationFrame(() => nextTask(resolve)))

/**
 * Times `work` to the frame. The work runs at the start of a frame, in a
 * `requestAnimationFrame` callback, so the wait for the next vsync is not in
 * the figure. The browser then does that frame's style, layout and paint, and a
 * task queued from the callback runs once they are done; its time is the end.
 * Raster and GPU presentation run off the main thread and are not included.
 * @returns {Promise<{ jsMs: number, toFrameMs: number, layoutLeftMs: number, valid: boolean, visibility: string, focused: boolean }>}
 * `jsMs` is the work alone; `layoutLeftMs` is the cost of forcing layout at the
 * end, which is near zero when the frame really did lay the commit out.
 */
function timeToFrame(work) {
  return new Promise(resolve => {
    let done = false
    const timeout = window.setTimeout(() => {
      done = true
      resolve({
        jsMs: null,
        toFrameMs: null,
        layoutLeftMs: null,
        valid: false,
        visibility: document.visibilityState,
        focused: document.hasFocus(),
        timedOut: true,
      })
    }, FRAME_TIMEOUT_MS)
    window.requestAnimationFrame(() => {
      if (done) return
      window.clearTimeout(timeout)
      const end = watchSample()
      const t0 = performance.now()
      work()
      const t1 = performance.now()
      nextTask(() => {
        const t2 = performance.now()
        void document.body.offsetHeight
        const t3 = performance.now()
        resolve({ jsMs: t1 - t0, toFrameMs: t2 - t0, layoutLeftMs: t3 - t2, ...end() })
      })
    })
  })
}

/**
 * Times `count` mounts back to back, JavaScript only, each the whole step a
 * page pays: building the tree (MeoNode's construction and `.render()`, or
 * React's `createElement` calls), then React's render and commit. Builds run
 * first and commits second, each phase timed on its own, so the split is
 * reported too. Creating the roots happens before the clock starts and
 * unmounting after it stops.
 * @returns Time per mount, in ms: `ms` for the whole step, `buildMs` and
 * `commitMs` for its phases, and the sample's validity.
 */
function mountMany(side, shape, n, count) {
  const roots = Array.from({ length: count }, () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    return { host, root: createRoot(host) }
  })
  const trees = new Array(count)
  const end = watchSample()
  const t0 = performance.now()
  for (let i = 0; i < count; i++) trees[i] = build(side, shape, n)
  const t1 = performance.now()
  for (let i = 0; i < count; i++) flushSync(() => roots[i].root.render(trees[i]))
  const t2 = performance.now()
  const validity = end()
  for (const { host, root } of roots) {
    flushSync(() => root.unmount())
    host.remove()
  }
  return { ms: (t2 - t0) / count, buildMs: (t1 - t0) / count, commitMs: (t2 - t1) / count, ...validity }
}

/** Mounts one tree timed to the frame, then unmounts it and lets that render too. */
async function mountToFrame(side, shape, n) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await afterFrame()
  const sample = await timeToFrame(() => {
    const tree = build(side, shape, n)
    flushSync(() => root.render(tree))
  })
  flushSync(() => root.unmount())
  host.remove()
  await afterFrame()
  return sample
}

/** Collects garbage, when the browser exposes `gc()`, so a sample does not pay for the side before it. */
const collectGarbage = () => window.gc?.()

/**
 * The side order of round `round`: a shuffle seeded by the round, so every
 * run uses the same orders, and each side follows a different side from round
 * to round instead of always the same one.
 */
function orderOf(sides, round) {
  let seed = round + 1
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const order = [...sides]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

/** How many runs one JavaScript-only sample needs to last {@link MIN_SAMPLE_MS}. */
const runsFor = msPerRun => Math.max(1, Math.ceil((MIN_SAMPLE_MS * SAMPLE_MARGIN) / Math.max(msPerRun, 0.001)))

/**
 * Summarises one side's samples: medians over the valid ones, and counts.
 * @param js JavaScript-only samples.
 * @param frames To-the-frame samples.
 */
function summarise(js, frames) {
  const validJs = js.filter(sample => sample.valid)
  const validFrames = frames.filter(sample => sample.valid)
  const phase = key => median(validJs.map(sample => sample[key]))
  return {
    ms: phase('ms'),
    ...(validJs[0]?.buildMs === undefined ? {} : { buildMs: phase('buildMs'), commitMs: phase('commitMs') }),
    samples: { valid: validJs.length, invalid: js.length - validJs.length, unfocused: js.filter(sample => !sample.focused).length },
    toFrame: {
      ms: median(validFrames.map(sample => sample.toFrameMs)),
      jsMs: median(validFrames.map(sample => sample.jsMs)),
      postCommitMs: median(validFrames.map(sample => sample.toFrameMs - sample.jsMs)),
      minPostCommitMs: validFrames.length ? Math.min(...validFrames.map(sample => sample.toFrameMs - sample.jsMs)) : null,
      maxLayoutLeftMs: validFrames.length ? Math.max(...validFrames.map(sample => sample.layoutLeftMs)) : null,
      notAfterCommit: validFrames.filter(sample => !(sample.toFrameMs > sample.jsMs)).length,
      samples: {
        valid: validFrames.length,
        invalid: frames.length - validFrames.length,
        timedOut: frames.filter(sample => sample.timedOut).length,
        unfocused: frames.filter(sample => !sample.focused).length,
      },
    },
  }
}

/** The smallest step `performance.now()` takes on this page, in ms. */
function timerResolutionMs() {
  let smallest = Infinity
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now()
    let t1 = t0
    while (t1 === t0) t1 = performance.now()
    smallest = Math.min(smallest, t1 - t0)
  }
  return smallest
}

/**
 * Mounts each side `rounds` times after two warm-ups, in a shuffled order
 * each round ({@link orderOf}), collecting garbage before every sample. Every
 * round takes one JavaScript-only sample per side, sized by
 * {@link MIN_SAMPLE_MS}, and one mount timed to the frame.
 */
async function runSides({ shape, n, rounds }) {
  const sides = Object.keys(SIDES)
  const js = Object.fromEntries(sides.map(side => [side, []]))
  const frames = Object.fromEntries(sides.map(side => [side, []]))
  const warm = Object.fromEntries(sides.map(side => [side, []]))
  for (let i = 0; i < 2; i++) {
    for (const side of sides) {
      warm[side].push(mountMany(side, shape, n, 1).ms)
      await mountToFrame(side, shape, n)
    }
  }
  // Size samples from the warm-ups, then once more from a sample of that size: warm-ups run cold and overestimate a mount.
  const perSample = Object.fromEntries(sides.map(side => [side, runsFor(Math.min(...warm[side]))]))
  for (const side of sides) perSample[side] = runsFor(mountMany(side, shape, n, perSample[side]).ms)
  await afterFrame()
  for (let r = 0; r < rounds; r++) {
    for (const side of orderOf(sides, r)) {
      collectGarbage()
      js[side].push(mountMany(side, shape, n, perSample[side]))
      collectGarbage()
      frames[side].push(await mountToFrame(side, shape, n))
    }
  }
  // Fibers per node from a ten-node tree: flat has one extra root element, nested has ten wraps around one leaf.
  const fibersPerNode = side => {
    const fibers = countMountedFibers(build(side, shape, 10))
    return shape === 'flat' ? (fibers - 1) / 10 : fibers / 11
  }
  return Object.fromEntries(
    sides.map(side => [side, { ...summarise(js[side], frames[side]), mountsPerSample: perSample[side], fibersPerNode: fibersPerNode(side) }]),
  )
}

/**
 * Mounts one update case, and returns functions that time `count` updates back
 * to back (JavaScript only), time one update to the frame, and unmount it.
 * The tree is built inside the component, so every update pays for building it.
 */
function mountUpdating(kind, side, n) {
  let setTick = () => {}
  const Case = () => {
    const [tick, set] = useState(0)
    setTick = set
    return SIDES[side].updates[kind](tick, n)
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  flushSync(() => root.render(createElement(Case)))
  return {
    time(count) {
      const end = watchSample()
      const t0 = performance.now()
      for (let i = 0; i < count; i++) flushSync(() => setTick(tick => tick + 1))
      return { ms: (performance.now() - t0) / count, ...end() }
    },
    async toFrame() {
      await afterFrame()
      return timeToFrame(() => flushSync(() => setTick(tick => tick + 1)))
    },
    unmount() {
      flushSync(() => root.unmount())
      host.remove()
    },
  }
}

/**
 * Times updates of one case on each side, `rounds` rounds after two warm-up
 * updates, in a shuffled order each round ({@link orderOf}), collecting
 * garbage before every sample. Every round takes one
 * JavaScript-only sample per side, sized by {@link MIN_SAMPLE_MS}, and one
 * update timed to the frame.
 */
async function runUpdates({ kind, n, rounds }) {
  const sides = Object.keys(SIDES)
  const cases = Object.fromEntries(sides.map(side => [side, mountUpdating(kind, side, n)]))
  const perSample = Object.fromEntries(sides.map(side => [side, runsFor(Math.min(cases[side].time(1).ms, cases[side].time(1).ms))]))
  for (const side of sides) {
    perSample[side] = runsFor(cases[side].time(perSample[side]).ms)
    await cases[side].toFrame()
  }
  const js = Object.fromEntries(sides.map(side => [side, []]))
  const frames = Object.fromEntries(sides.map(side => [side, []]))
  for (let r = 0; r < rounds; r++) {
    for (const side of orderOf(sides, r)) {
      collectGarbage()
      js[side].push(cases[side].time(perSample[side]))
      collectGarbage()
      frames[side].push(await cases[side].toFrame())
    }
  }
  for (const side of sides) cases[side].unmount()
  return Object.fromEntries(sides.map(side => [side, { ...summarise(js[side], frames[side]), updatesPerSample: perSample[side] }]))
}

/** The MeoNode builds on this page, by side name, for the app-shaped cases. Set by {@link start}. */
let BUILDS = {}

/** The app-shaped cases: each maps a build to a root element maker and, where it updates, a bump. */
const APP_CASES = { app: appOf, flatThemed: flatThemedOf }

/**
 * Times one app-shaped case for one build on this page, which must be fresh.
 * The first mount is the cold one: Emotion's sheet is empty and the code has
 * not run yet, as on a page's first load. For the app, the update after it is
 * the cold update. Then `rounds` warm rounds mount, update and unmount on the
 * same page. Every mount and update is timed to the frame, which also gives
 * its JavaScript-only time, with garbage collected before it.
 * @returns The cold samples and the warm ones, each `{ jsMs, toFrameMs, valid, … }`.
 */
async function runApp({ kind, side, rounds }) {
  const subject = APP_CASES[kind](BUILDS[side])
  const once = async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    collectGarbage()
    await afterFrame()
    const mount = await timeToFrame(() => flushSync(() => root.render(subject.element())))
    let update = null
    if (subject.bump) {
      collectGarbage()
      await afterFrame()
      update = await timeToFrame(() => flushSync(subject.bump))
    }
    flushSync(() => root.unmount())
    host.remove()
    await afterFrame()
    return { mount, update }
  }
  const cold = await once()
  const warm = []
  for (let r = 0; r < rounds; r++) warm.push(await once())
  return { cold, warm }
}

/**
 * Sets up the page: React's sides, MeoNode's sides from build `A`, and, when
 * given, a second set from build `B` with the suffix `B`, then exposes the
 * runners on `window`.
 * @param builds `A` is the `@meonode/ui` build under test; `B` is another one
 * to compare it with, or `null`.
 */
export function start({ A, B }) {
  const withLib = (sides, lib) => Object.fromEntries(Object.entries(sides).map(([name, side]) => [name, { ...side, lib }]))
  SIDES = {
    ...REACT_SIDES,
    ...withLib(meonodeSides(A, ''), A),
    ...(B ? withLib(meonodeSides(B, 'B'), B) : {}),
  }
  const rules = document.createElement('style')
  rules.textContent = CLASS_RULES
  document.head.appendChild(rules)
  BUILDS = { meonode: A, ...(B ? { meonodeB: B } : {}) }
  window.runSides = runSides
  window.runUpdates = runUpdates
  window.runApp = runApp
  window.pageInfo = () => ({
    gcBeforeSamples: typeof window.gc === 'function',
    crossOriginIsolated: window.crossOriginIsolated,
    timerResolutionMs: timerResolutionMs(),
    userAgent: window.navigator.userAgent,
  })
}
