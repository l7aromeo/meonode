// Server-renders one case of one built side in one mode, and prints JSON
// `{ head, body }`. Each render runs in a process of its own, as a fresh
// server's first request: a module-level store (an Emotion cache a case or a
// part creates, which keeps the names it has inserted) would otherwise carry
// from one render to the next and leave the later one without its styles.
//   plain:    react-dom/server with no registry, so the server css cache path
//   registry: under StyleRegistry, with Next's ServerInsertedHTMLContext
//             provided, whose flush goes into the head
// A case whose meta.render is 'client' gets an empty body; 'stream' renders
// through renderToPipeableStream once every boundary is ready, and
// 'stream-late' from the shell on, so a boundary that resolves later arrives
// after it as React streams it (a hidden segment and the script that swaps it in); 'rsc' renders the Flight payload in
// `<side dir>/rsc/payloads.json` (from rsc.mjs), streamed, as Next's server
// render of a server component page does.
// A case whose server render throws gets `{ error }` in place of its HTML.
// usage: NODE_ENV=production node ssr.mjs <side dir> <plain|registry> <case>
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { Readable, Writable } from 'node:stream'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [dir, mode, name, ...rest] = process.argv.slice(2)
if (!['plain', 'registry'].includes(mode) || !name || rest.length)
  throw new Error('usage: node ssr.mjs <side dir> <plain|registry> <case>: one render per process, so no module state carries from one to the next')
const require = createRequire(join(dir, 'entry.mjs'))
const { createElement, Fragment } = require('react')
const { renderToString, renderToPipeableStream } = require('react-dom/server')
const { ServerInsertedHTMLContext } = require('next/navigation.js')
const { Shell } = await import(pathToFileURL(join(dir, 'shell.mjs')).href)
const { StyleRegistry } = await import(pathToFileURL(join(dir, 'dist/esm/nextjs-registry/index.js')).href)
const { createFromNodeStream } = require('react-server-dom-turbopack/client.node')

/** The server-component payloads, and the client modules they reference, loaded as SSR loads them. */
const payloads = existsSync(join(dir, 'rsc/payloads.json')) ? JSON.parse(readFileSync(join(dir, 'rsc/payloads.json'), 'utf8')) : {}
const clientModules = new Map()
if (existsSync(join(dir, 'rsc/client-modules.json'))) {
  for (const url of Object.keys(JSON.parse(readFileSync(join(dir, 'rsc/client-modules.json'), 'utf8')))) clientModules.set(url, await import(url))
}
globalThis.__turbopack_require__ = id => clientModules.get(id)
globalThis.__turbopack_load_by_url__ = () => Promise.resolve()
const { use } = require('react')
/** Renders the element a Flight response resolves to. */
const FlightRoot = ({ response }) => use(response)
/** A fresh element for a server-component case's payload: each render reads its own response. */
const flightPage = payload =>
  createElement(FlightRoot, { response: createFromNodeStream(Readable.from([payload]), { moduleMap: null, serverModuleMap: null, moduleLoading: null }) })

/** Whether this process has rendered a page: it renders one. */
let rendered = false

/** Renders an element to HTML, as a string or as a stream drained to its end: `stream` is false, 'all' (from when every boundary is ready) or 'shell' (from the shell on). */
function render(element, stream) {
  if (rendered) throw new Error('ssr.mjs renders one page per process: a second render would see the first one\'s module state')
  rendered = true
  if (!stream) return Promise.resolve(renderToString(element))
  return new Promise((resolve, reject) => {
    let html = ''
    const sink = new Writable({
      write(chunk, _, done) {
        html += chunk
        done()
      },
      final(done) {
        resolve(html)
        done()
      },
    })
    const ready = () => pipe(sink)
    const { pipe } = renderToPipeableStream(element, { ...(stream === 'shell' ? { onShellReady: ready } : { onAllReady: ready }), onError: reject })
  })
}

/** The case's one render in `mode`, or the error its server render threw. */
async function renderCase() {
  const mod = await import(pathToFileURL(join(dir, 'corpus', `${name}.mjs`)).href)
  const rsc = mod.meta.render === 'rsc'
  if (rsc && !payloads[name]?.payload) return { error: `no server-component payload: ${payloads[name]?.error ?? 'rsc.mjs did not render it'}` }
  if (mod.meta.render === 'client') return { head: '', body: '' }
  const page = rsc ? flightPage(payloads[name].payload) : Shell(createElement(mod.App))
  const stream = mod.meta.render === 'stream-late' ? 'shell' : mod.meta.render === 'stream' || rsc ? 'all' : false
  try {
    if (mode === 'plain') return { head: '', body: await render(page, stream) }
    const callbacks = []
    const body = await render(
      createElement(ServerInsertedHTMLContext.Provider, { value: cb => callbacks.push(cb) }, createElement(StyleRegistry, null, page)),
      stream,
    )
    return { head: renderToString(createElement(Fragment, null, ...callbacks.map(cb => cb()))), body }
  } catch (error) {
    return { error: String(error?.stack ?? error) }
  }
}
process.stdout.write(JSON.stringify(await renderCase()))
