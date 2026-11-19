// Mounts one chain of styled nodes `workerData.levels` deep and posts what
// rendered. Runs in a worker from `runWithDeepStack` (see `_lib.mjs`), so a
// stack overflow throws `RangeError` here rather than crashing the process.
import { parentPort, workerData } from 'node:worker_threads'
import { bootDom } from './_lib.mjs'

await bootDom()

const { Div, Span } = await import('../dist/esm/main.js')
const { createRoot } = await import('react-dom/client')
const { flushSync } = await import('react-dom')

const { levels } = workerData
let node = Span('leaf', { padding: '1px' })
for (let i = 0; i < levels; i++) node = Div({ padding: '1px', children: node })

const host = document.createElement('div')
document.body.appendChild(host)
try {
  flushSync(() => createRoot(host).render(node.render()))
  const leaf = host.querySelector('span')
  let depth = 0
  for (let el = leaf?.parentElement; el && el !== host; el = el.parentElement) depth++
  parentPort.postMessage({ leafRendered: leaf?.textContent === 'leaf', depth })
} catch (error) {
  parentPort.postMessage({ error: `${error.name}: ${error.message}` })
}
