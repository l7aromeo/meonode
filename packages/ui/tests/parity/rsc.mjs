// Renders the server-component cases of one built side through React's Flight
// protocol, as the React Server Components layer does, and prints JSON:
// `{ <case>: { payload } | { error } }`.
//
//   node --conditions=react-server rsc.mjs <side dir> <case>...
//
// `react` then resolves to its react-server build, and each case is the one
// compiled against the side's rsc entry. A bundler replaces every module that
// opens with 'use client' by client references; the load hook below does the
// same for the modules in `<side dir>/rsc/client-modules.json` (file URL →
// export names), and the manifest names each by its file URL.
import { registerHooks } from 'node:module'
import { join } from 'node:path'
import process from 'node:process'
import { Writable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'

const [dir, ...names] = process.argv.slice(2)
const clientModules = JSON.parse(readFileSync(join(dir, 'rsc/client-modules.json'), 'utf8'))
const SERVER = 'react-server-dom-turbopack/server'

registerHooks({
  load(url, context, nextLoad) {
    const exported = clientModules[url]
    if (!exported) return nextLoad(url, context)
    const reference = name =>
      `registerClientReference(function () { throw new Error(${JSON.stringify(`${url}#${name} was called on the server`)}) }, ${JSON.stringify(url)}, ${JSON.stringify(name)})`
    const source = [
      `import { registerClientReference } from ${JSON.stringify(SERVER)}`,
      ...exported.map(name => (name === 'default' ? `export default ${reference(name)}` : `export const ${name} = ${reference(name)}`)),
    ].join('\n')
    return { format: 'module', source, shortCircuit: true }
  },
})

const { createElement } = await import('react')
const { renderToPipeableStream } = await import(SERVER)
// The shell imports the package's server entry; a module it cannot link fails every case, not the run.
const shell = await import(pathToFileURL(join(dir, 'rsc/shell.mjs')).href).catch(error => ({ error }))

/** Every client module is its own entry, with no chunks to load. */
const manifest = Object.fromEntries(Object.keys(clientModules).map(url => [url, { id: url, chunks: [], name: '*' }]))

/** The Flight payload of one element, drained to its end. */
function flight(element) {
  return new Promise((resolve, reject) => {
    let payload = ''
    const sink = new Writable({
      write(chunk, _, done) {
        payload += chunk
        done()
      },
      final(done) {
        resolve(payload)
        done()
      },
    })
    renderToPipeableStream(element, manifest, { onError: reject }).pipe(sink)
  })
}

const out = {}
for (const name of names) {
  try {
    if (shell.error) throw shell.error
    const mod = await import(pathToFileURL(join(dir, 'rsc/corpus', `${name}.mjs`)).href)
    out[name] = { payload: await flight(shell.Shell(createElement(mod.App))) }
  } catch (error) {
    out[name] = { error: String(error?.stack ?? error) }
  }
}
process.stdout.write(JSON.stringify(out))
