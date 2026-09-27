// Streams one Suspense boundary with React's own server renderer, as a page
// would: the shell while the boundary's content is still pending, then the
// chunk that completes it. Run in a plain Node process, because the DOM test
// environment does not flush a stream's shell before it finishes.
// Prints `{ boundary, completion }`: the boundary's markup as the shell leaves
// it, and everything written after it.
import { createElement, Suspense, use } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import process from 'node:process'
import { Writable } from 'node:stream'
import { setTimeout } from 'node:timers'

let resolve
const data = new Promise(r => (resolve = r))
function Content() {
  return createElement('p', { id: 'content' }, use(data))
}
const tree = createElement('main', null, createElement(Suspense, { fallback: createElement('p', { id: 'fallback' }, 'loading') }, createElement(Content)))

let written = ''
let shell = ''
const sink = new Writable({
  write(chunk, _, callback) {
    written += chunk
    callback()
  },
  final(callback) {
    const boundary = shell.slice(shell.indexOf('<main>') + '<main>'.length, shell.indexOf('</main>'))
    process.stdout.write(JSON.stringify({ boundary, completion: written.slice(shell.length) }))
    callback()
  },
})
const { pipe } = renderToPipeableStream(tree, {
  onShellReady() {
    pipe(sink)
    setTimeout(() => {
      shell = written
      resolve('streamed')
    }, 50)
  },
})
