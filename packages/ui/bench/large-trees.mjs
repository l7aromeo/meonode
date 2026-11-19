// Large-tree rendering: flat breadth and deep nesting.
//
// Nesting is timed at 500 levels, against React putting a static className on
// each level, and the figure is the time MeoNode adds per level. Deeper chains
// mostly time jsdom: since jsdom 30.1.0 every insertion into a detached parent
// walks the whole inserted subtree, and React builds the DOM bottom-up while
// detached, so jsdom's share grows with the square of the depth (jsdom 31.0.1
// takes about 2.5x as long as jsdom 29.1.1 for 10,000 levels). Both sides of
// the pair pay that DOM cost, so the per-level difference is MeoNode's own.
//
// The stack-safety case mounts 10,000 nested levels and reports whether they
// rendered, not how long it took. `render()` walks iteratively with an explicit
// work stack so building the tree cannot overflow; React's commit phase does
// recurse per fiber, so the mount runs in a worker with a stack the OS really
// grants (see `runWithDeepStack`).
import { URL } from 'node:url'
import { bootDom, compare, median, report, runWithDeepStack } from './_lib.mjs'

await bootDom()

const { Div, Span } = await import('../dist/esm/main.js')
const { createElement } = await import('react')
const { createRoot } = await import('react-dom/client')
const { flushSync } = await import('react-dom')

const FLAT_NODES = Number(process.env.FLAT_NODES || 10000)
const NESTED_LEVELS = Number(process.env.NESTED_LEVELS || 500)
const STACK_SAFETY_LEVELS = Number(process.env.STACK_SAFETY_LEVELS || 10000)
const ROUNDS = Number(process.env.ROUNDS || 5)

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
  const tree = build()
  flushSync(() => root.render(tree))
  const ms = performance.now() - t0
  flushSync(() => root.unmount())
  host.remove()
  return ms
}

function flatTree() {
  const children = new Array(FLAT_NODES)
  for (let i = 0; i < FLAT_NODES; i++) children[i] = Span(`n${i}`, { padding: '1px', color: '#333' })
  return Div({ children }).render()
}

function nestedReact() {
  let node = createElement('span', { className: 'c' }, 'leaf')
  for (let i = 0; i < NESTED_LEVELS; i++) node = createElement('div', { className: 'c' }, node)
  return node
}

function nestedMeo() {
  let node = Span('leaf', { padding: '1px' })
  for (let i = 0; i < NESTED_LEVELS; i++) node = Div({ padding: '1px', children: node })
  return node.render()
}

// A realistic page shape: mixed depth and breadth rather than one degenerate axis.
function layoutTree() {
  const section = (title, rows) =>
    Div({
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      children: [
        Span(title, { fontSize: '20px', fontWeight: 'bold' }),
        ...Array.from({ length: rows }, (_, i) =>
          Div({
            padding: '8px',
            margin: '4px',
            backgroundColor: i % 2 === 0 ? '#fff' : '#eee',
            display: 'flex',
            children: [Span(`row ${i}`, { flex: 1 }), Span(`v${i}`, { color: '#666' })],
          }),
        ),
      ],
    })

  return Div({
    display: 'flex',
    flexDirection: 'column',
    children: [
      Div({ padding: '12px', backgroundColor: '#111', children: Span('header', { color: '#fff' }) }),
      section('features', 40),
      section('article', 60),
      section('testimonials', 30),
      Div({ padding: '12px', children: Span('footer', { color: '#666' }) }),
    ],
  }).render()
}

const measure = build => {
  for (let i = 0; i < 2; i++) mount(build)
  return median(Array.from({ length: ROUNDS }, () => mount(build)))
}

const layoutMs = measure(layoutTree)
const flatMs = measure(flatTree)
for (let i = 0; i < 2; i++) {
  mount(nestedReact)
  mount(nestedMeo)
}
const nested = compare({ rounds: Math.max(ROUNDS, 8), a: () => mount(nestedReact), b: () => mount(nestedMeo), labelA: 'reactMs', labelB: 'meonodeMs' })
const stackSafety = await runWithDeepStack(new URL('./stack-safety.worker.mjs', import.meta.url), { levels: STACK_SAFETY_LEVELS }).then(
  ({ leafRendered, depth, error }) => (error ? { ok: false, error } : { ok: leafRendered && depth === STACK_SAFETY_LEVELS, depth }),
  error => ({ ok: false, error: `${error.name}: ${error.message}` }),
)

await report('large-trees', {
  singlePageLayoutMs: +layoutMs.toFixed(2),
  flatNodes: FLAT_NODES,
  flatMs: +flatMs.toFixed(2),
  nested: {
    levels: NESTED_LEVELS,
    addedUsPerLevel: +(((nested.meonodeMs - nested.reactMs) / NESTED_LEVELS) * 1000).toFixed(2),
    reactMs: nested.reactMs,
    meonodeMs: nested.meonodeMs,
  },
  stackSafety: { levels: STACK_SAFETY_LEVELS, ...stackSafety },
})

if (!stackSafety.ok) {
  console.error(`\nstack safety: ${STACK_SAFETY_LEVELS} nested levels did not render (${stackSafety.error ?? `depth ${stackSafety.depth}`})`)
  process.exitCode = 1
}
