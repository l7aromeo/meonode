// Server-renders every case of one built side, in a process of its own so no
// server store is shared between sides, and prints JSON:
// `{ plain: { <case>: { head, body } }, registry: { … } }`.
//   plain:    react-dom/server with no registry, so the server css cache path
//   registry: under StyleRegistry, with Next's ServerInsertedHTMLContext
//             provided, whose flush goes into the head
// A case whose meta.render is 'client' gets an empty body; 'stream' renders
// through renderToPipeableStream.
// A case whose server render throws gets `{ error }` in place of its HTML.
// usage: NODE_ENV=production node ssr.mjs <side dir> <case>...
import { createRequire } from 'node:module'
import { Writable } from 'node:stream'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [dir, ...names] = process.argv.slice(2)
const require = createRequire(join(dir, 'entry.mjs'))
const { createElement, Fragment } = require('react')
const { renderToString, renderToPipeableStream } = require('react-dom/server')
const { ServerInsertedHTMLContext } = require('next/navigation.js')
const { Shell } = await import(pathToFileURL(join(dir, 'shell.mjs')).href)
const { StyleRegistry } = await import(pathToFileURL(join(dir, 'dist/esm/nextjs-registry/index.js')).href)

/** Renders an element to HTML, as a string or as a stream drained to its end. */
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
    const { pipe } = renderToPipeableStream(element, { onAllReady: () => pipe(sink), onError: reject })
  })
}

const out = { plain: {}, registry: {} }
for (const name of names) {
  const mod = await import(pathToFileURL(join(dir, 'corpus', `${name}.mjs`)).href)
  const page = () => Shell(createElement(mod.App))
  const stream = mod.meta.render === 'stream'
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
    const body = await render(createElement(ServerInsertedHTMLContext.Provider, { value: cb => callbacks.push(cb) }, createElement(StyleRegistry, null, page())), stream)
    out.registry[name] = { head: renderToString(createElement(Fragment, null, ...callbacks.map(cb => cb()))), body }
  } catch (error) {
    out.registry[name] = { error: String(error?.stack ?? error) }
  }
}
process.stdout.write(JSON.stringify(out))
