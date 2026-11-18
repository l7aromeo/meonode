// Renders a server component tree from the built @meonode/ui through React's Flight
// protocol and writes the payload to stdout. FLIGHT_UI_ENTRY names the entry of its
// server build to load, the ES module or the CommonJS one. Run as the React Server
// Components layer runs it:
//
//   node --conditions=react-server server.mjs <visible|hidden>
//
// so `react` resolves to its `react-server` build. A bundler replaces every module that
// opens with 'use client' by client references; the load hook below does the same for
// the modules named in FLIGHT_CLIENT_EXPORTS, a JSON map from file URL to export names.
import { registerHooks } from 'node:module'
import process from 'node:process'

const clientExports = JSON.parse(process.env.FLIGHT_CLIENT_EXPORTS ?? '{}')
const SERVER = 'react-server-dom-turbopack/server'

registerHooks({
  load(url, context, nextLoad) {
    const names = clientExports[url]
    if (!names) return nextLoad(url, context)
    const reference = name =>
      `registerClientReference(function () { throw new Error(${JSON.stringify(`${url}#${name} was called on the server`)}) }, ${JSON.stringify(url)}, ${JSON.stringify(name)})`
    const source = [
      `import { registerClientReference } from ${JSON.stringify(SERVER)}`,
      ...names.map(name => (name === 'default' ? `export default ${reference(name)}` : `export const ${name} = ${reference(name)}`)),
    ].join('\n')
    return { format: 'module', source, shortCircuit: true }
  },
})

const [mode] = process.argv.slice(2)
const { createElement } = await import('react')
const { renderToPipeableStream } = await import(SERVER)
const ui = await import(process.env.FLIGHT_UI_ENTRY)
const { Counter } = await import(process.env.FLIGHT_COUNTER)

/** Every client module is its own entry in the manifest, with no chunks to load. */
const manifest = Object.fromEntries(Object.keys(clientExports).map(url => [url, { id: url, chunks: [], name: '*' }]))

const tree = ui
  .Activity({
    mode,
    children: ui.Div({ 'data-testid': 'activity-content', children: createElement(Counter) }),
  })
  .render()

const stream = renderToPipeableStream(tree, manifest, {
  onError(error) {
    process.stderr.write(`${error?.stack ?? error}\n`)
    process.exitCode = 1
  },
})
stream.pipe(process.stdout)
