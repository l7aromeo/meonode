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

/** Mounts each side `rounds` times after two warm-ups, rotating the order every round. */
window.runSides = ({ shape, n, rounds }) => {
  const sides = Object.keys(SIDES)
  const times = Object.fromEntries(sides.map(side => [side, []]))
  for (let i = 0; i < 2; i++) for (const side of sides) mount(build(side, shape, n))
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < sides.length; i++) {
      const side = sides[(i + r) % sides.length]
      times[side].push(mount(build(side, shape, n)).ms)
    }
  }
  // Fibers per node from a ten-node tree: flat has one extra root element, nested has ten wraps around one leaf.
  const fibersPerNode = side => {
    const { fibers } = mount(build(side, shape, 10), true)
    return shape === 'flat' ? (fibers - 1) / 10 : fibers / 11
  }
  return Object.fromEntries(sides.map(side => [side, { ms: median(times[side]), fibersPerNode: fibersPerNode(side) }]))
}
