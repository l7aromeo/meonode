// Server-renders every case of one built side, in a process of its own so no
// server store is shared between sides, and prints JSON:
// `{ plain: { <case>: { head, body } }, registry: { … } }`.
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
// usage: NODE_ENV=production node ssr.mjs <side dir> <case>...
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { Readable, Writable } from 'node:stream'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [dir, ...names] = process.argv.slice(2)
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

/** Renders an element to HTML, as a string or as a stream drained to its end: `stream` is false, 'all' (from when every boundary is ready) or 'shell' (from the shell on). */
function render(element, stream) {
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

const out = { plain: {}, registry: {} }
for (const name of names) {
  const mod = await import(pathToFileURL(join(dir, 'corpus', `${name}.mjs`)).href)
  const rsc = mod.meta.render === 'rsc'
  if (rsc && !payloads[name]?.payload) {
    out.plain[name] = out.registry[name] = { error: `no server-component payload: ${payloads[name]?.error ?? 'rsc.mjs did not render it'}` }
    continue
  }
  const page = () => (rsc ? flightPage(payloads[name].payload) : Shell(createElement(mod.App)))
  const stream = mod.meta.render === 'stream-late' ? 'shell' : mod.meta.render === 'stream' || rsc ? 'all' : false
  if (mod.meta.render === 'client') {
    out.plain[name] = out.registry[name] = { head: '', body: '' }
    continue
  }
  try {
    out.plain[name] = { head: '', body: await render(page(), stream) }
  } catch (error) {
    out.plain[name] = { error: String(error?.stack ?? error) }
  }
  try {
    const callbacks = []
    const body = await render(
      createElement(ServerInsertedHTMLContext.Provider, { value: cb => callbacks.push(cb) }, createElement(StyleRegistry, null, page())),
      stream,
    )
    out.registry[name] = { head: renderToString(createElement(Fragment, null, ...callbacks.map(cb => cb()))), body }
  } catch (error) {
    out.registry[name] = { error: String(error?.stack ?? error) }
  }
}
process.stdout.write(JSON.stringify(out))
