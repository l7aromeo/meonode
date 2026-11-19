// Runs inside Chromium, bundled by `browser-comparison.mjs`. Mounts the same
// shape four ways and reports median mount times and fiber counts.
import { jsx } from '@emotion/react'
import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Div, Span } from '../dist/esm/main.js'

/** One style property, the same on every side that styles. */
const PADDING = { padding: '1px' }

/**
 * The four sides. `reactClass` is the baseline: React setting a static class,
 * with no CSS-in-JS. `reactEmotion` is what Emotion's own css prop costs;
 * `meoStyled` is MeoNode on top of Emotion; `meoUnstyled` is MeoNode with no style.
 */
const SIDES = {
  reactClass: { leaf: (key, text) => createElement('span', { key, className: 'c' }, text), wrap: child => createElement('div', { className: 'c' }, child) },
  reactEmotion: { leaf: (key, text) => jsx('span', { key, css: PADDING }, text), wrap: child => jsx('div', { css: PADDING }, child) },
  meoStyled: { leaf: (key, text) => Span(text, { key, ...PADDING }), wrap: child => Div({ ...PADDING, children: child }), meonode: true },
  meoUnstyled: { leaf: (key, text) => Span(text, { key }), wrap: child => Div({ children: child }), meonode: true },
}

function build(side, shape, n) {
  const { leaf, wrap, meonode } = SIDES[side]
  if (shape === 'flat') {
    const children = Array.from({ length: n }, (_, i) => leaf(i, `n${i}`))
    return meonode ? Div({ children }).render() : createElement('div', null, children)
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

/** Mounts one tree and, on request, counts its fibers. */
function mount(tree, withFibers = false) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const t0 = performance.now()
  flushSync(() => root.render(tree))
  const ms = performance.now() - t0
  const fibers = withFibers ? countFibers(host) : undefined
  flushSync(() => root.unmount())
  host.remove()
  return { ms, fibers }
}

const median = xs => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/**
 * Shortest time one sample may take, in ms. `performance.now()` is coarsened
 * to 0.1 ms in a page without cross-origin isolation, so a sample that short
 * would round a 500-level mount to a few steps; each sample therefore times
 * enough consecutive mounts to last at least this long.
 */
const MIN_SAMPLE_MS = 20

/**
 * Times `count` mounts back to back, each the whole step a page pays: building
 * the tree (MeoNode's construction and `.render()`, or React's
 * `createElement` calls), then React's render and commit. Builds run first
 * and commits second, each phase timed on its own, so the split is reported
 * too. Creating the roots happens before the clock starts and unmounting
 * after it stops.
 * @returns Time per mount, in ms: `ms` for the whole step, `buildMs` and
 * `commitMs` for its phases.
 */
function mountMany(side, shape, n, count) {
  const roots = Array.from({ length: count }, () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    return { host, root: createRoot(host) }
  })
  const trees = new Array(count)
  const t0 = performance.now()
  for (let i = 0; i < count; i++) trees[i] = build(side, shape, n)
  const t1 = performance.now()
  for (let i = 0; i < count; i++) flushSync(() => roots[i].root.render(trees[i]))
  const t2 = performance.now()
  for (const { host, root } of roots) {
    flushSync(() => root.unmount())
    host.remove()
  }
  return { ms: (t2 - t0) / count, buildMs: (t1 - t0) / count, commitMs: (t2 - t1) / count }
}

/**
 * Mounts each side `rounds` times after two warm-ups, rotating the order every
 * round. Each sample times as many mounts as {@link MIN_SAMPLE_MS} needs for
 * that side.
 */
window.runSides = ({ shape, n, rounds }) => {
  const sides = Object.keys(SIDES)
  const samples = Object.fromEntries(sides.map(side => [side, []]))
  const warm = Object.fromEntries(sides.map(side => [side, []]))
  for (let i = 0; i < 2; i++) for (const side of sides) warm[side].push(mountMany(side, shape, n, 1).ms)
  // Size samples from the warm-ups, then once more from a sample of that size: warm-ups run cold and overestimate a mount.
  // A quarter more than the minimum, since a mount's time varies between samples.
  const mountsFor = msPerMount => Math.max(1, Math.ceil((MIN_SAMPLE_MS * 1.25) / Math.max(msPerMount, 0.01)))
  const perSample = Object.fromEntries(sides.map(side => [side, mountsFor(Math.min(...warm[side]))]))
  for (const side of sides) perSample[side] = mountsFor(mountMany(side, shape, n, perSample[side]).ms)
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < sides.length; i++) {
      const side = sides[(i + r) % sides.length]
      samples[side].push(mountMany(side, shape, n, perSample[side]))
    }
  }
  // Fibers per node from a ten-node tree: flat has one extra root element, nested has ten wraps around one leaf.
  const fibersPerNode = side => {
    const { fibers } = mount(build(side, shape, 10), true)
    return shape === 'flat' ? (fibers - 1) / 10 : fibers / 11
  }
  const phase = (side, key) => median(samples[side].map(sample => sample[key]))
  return Object.fromEntries(
    sides.map(side => [
      side,
      {
        ms: phase(side, 'ms'),
        buildMs: phase(side, 'buildMs'),
        commitMs: phase(side, 'commitMs'),
        mountsPerSample: perSample[side],
        fibersPerNode: fibersPerNode(side),
      },
    ]),
  )
}
