// Large-tree rendering: flat breadth and deep nesting.
//
// The stack-safety case mounts 10,000 nested levels and reports whether they
// rendered, not how long it took. `render()` walks iteratively with an explicit
// work stack so building the tree cannot overflow; React's commit phase does
// recurse per fiber, so the mount runs in a worker with a stack the OS really
// grants (see `runWithDeepStack`).
import { URL } from 'node:url'
import { bootDom, median, report, runWithDeepStack } from './_lib.mjs'

await bootDom()

const { Div, Span } = await import('../dist/esm/main.js')
const { createRoot } = await import('react-dom/client')
const { flushSync } = await import('react-dom')

const FLAT_NODES = Number(process.env.FLAT_NODES || 10000)
const STACK_SAFETY_LEVELS = Number(process.env.STACK_SAFETY_LEVELS || 10000)
const ROUNDS = Number(process.env.ROUNDS || 5)

function mount(tree) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const t0 = performance.now()
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
  for (let i = 0; i < 2; i++) mount(build())
  return median(Array.from({ length: ROUNDS }, () => mount(build())))
}

const layoutMs = measure(layoutTree)
const flatMs = measure(flatTree)
const stackSafety = await runWithDeepStack(new URL('./stack-safety.worker.mjs', import.meta.url), { levels: STACK_SAFETY_LEVELS }).then(
  ({ leafRendered, depth, error }) => (error ? { ok: false, error } : { ok: leafRendered && depth === STACK_SAFETY_LEVELS, depth }),
  error => ({ ok: false, error: `${error.name}: ${error.message}` }),
)

await report('large-trees', {
  singlePageLayoutMs: +layoutMs.toFixed(2),
  flatNodes: FLAT_NODES,
  flatMs: +flatMs.toFixed(2),
  stackSafety: { levels: STACK_SAFETY_LEVELS, ...stackSafety },
})

if (!stackSafety.ok) {
  console.error(`\nstack safety: ${STACK_SAFETY_LEVELS} nested levels did not render (${stackSafety.error ?? `depth ${stackSafety.depth}`})`)
  process.exitCode = 1
}
