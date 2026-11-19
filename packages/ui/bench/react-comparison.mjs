// MeoNode against raw React.createElement, in jsdom. For diagnosis only: the
// published comparison comes from `browser-comparison.mjs`, which runs in
// Chromium, because jsdom's DOM work is slow enough to hide what a library adds
// and its cost changes between jsdom versions.
//
// Two pairs, each measured in one process with alternating rounds:
// - bare: no props on either side;
// - styled: React setting a static className against MeoNode with one style
//   property. Both put one class on every element. React's inline `style`
//   would make jsdom's CSSOM cost part of the comparison, and that cost
//   differs between jsdom versions by more than MeoNode's own.
//
// The figure is the time MeoNode adds per node, in µs. A ratio would move with
// the DOM's share of the work even when MeoNode's own cost stays the same.
import { bootDom, compare, report } from './_lib.mjs'

await bootDom()

const { Div, Span } = await import('../dist/esm/main.js')
const { createElement } = await import('react')
const { createRoot } = await import('react-dom/client')
const { flushSync } = await import('react-dom')

const FLAT = Number(process.env.FLAT || 10000)
const NESTED = Number(process.env.NESTED || 500)
const ROUNDS = Number(process.env.ROUNDS || 8)

/** The one style property MeoNode's styled side writes. */
const PADDING = { padding: '1px' }

/**
 * Mounts one tree and times the whole step: building it (MeoNode's
 * construction and `.render()`, or React's `createElement` calls) and React's
 * render and commit. Creating the root is outside the clock.
 */
function mount(build) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const t0 = performance.now()
  const element = build()
  flushSync(() => root.render(element))
  const ms = performance.now() - t0
  flushSync(() => root.unmount())
  host.remove()
  return ms
}

const reactProps = { bare: null, styled: { className: 'c' } }
const meoProps = { bare: {}, styled: PADDING }

const flatReact = pair => () =>
  mount(() =>
    createElement(
      'div',
      null,
      Array.from({ length: FLAT }, (_, i) => createElement('span', { key: i, ...reactProps[pair] }, `n${i}`)),
    ),
  )

const flatMeo = pair => () => mount(() => Div({ children: Array.from({ length: FLAT }, (_, i) => Span(`n${i}`, { key: i, ...meoProps[pair] })) }).render())

const nestedReact = pair => () =>
  mount(() => {
    let node = createElement('span', reactProps[pair], 'leaf')
    for (let i = 0; i < NESTED; i++) node = createElement('div', reactProps[pair], node)
    return node
  })

const nestedMeo = pair => () =>
  mount(() => {
    let node = Span('leaf', meoProps[pair])
    for (let i = 0; i < NESTED; i++) node = Div({ ...meoProps[pair], children: node })
    return node.render()
  })

/** Runs one pair and reports MeoNode's added time per node alongside both medians. */
function pairResult(a, b, nodes) {
  const { reactMs, meonodeMs } = compare({ rounds: ROUNDS, a, b, labelA: 'reactMs', labelB: 'meonodeMs' })
  return { reactMs, meonodeMs, addedUsPerNode: +(((meonodeMs - reactMs) / nodes) * 1000).toFixed(2) }
}

await report('react-comparison', {
  dom: 'jsdom (diagnosis only; see browser-comparison for published figures)',
  flatNodes: FLAT,
  nestedLevels: NESTED,
  flat: {
    bare: pairResult(flatReact('bare'), flatMeo('bare'), FLAT),
    styled: pairResult(flatReact('styled'), flatMeo('styled'), FLAT),
  },
  nested: {
    bare: pairResult(nestedReact('bare'), nestedMeo('bare'), NESTED),
    styled: pairResult(nestedReact('styled'), nestedMeo('styled'), NESTED),
  },
  note: 'addedUsPerNode is the time MeoNode adds per node or nesting level over React. The styled pair compares a static className with one MeoNode style property.',
})
