// A test stand-in, not a production path: no app or build loads this file.
//
// Preloaded with `node --import` beside `--conditions=react-server`, it mimics
// what a bundler does with `'use client'` in the React Server Components layer:
// a module that opens with the directive is replaced by client references, every
// export a placeholder that is never run, and is not linked or evaluated itself.
// Every other module, the server build's own and the packages it imports, links
// and runs for real against React's react-server build.
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

const USE_CLIENT = /^\s*["']use client["']/

/** The export names of a built module, ES or CommonJS. */
function exportNames(source, format) {
  if (format === 'module')
    return [...source.matchAll(/export\s*\{([^}]*)\}/g)]
      .flatMap(([, list]) => list.split(',').map(part => part.trim().split(/\s+as\s+/).pop()))
      .filter(Boolean)
      .concat(/export default/.test(source) ? ['default'] : [])
  return [...new Set([...source.matchAll(/exports\.([\w$]+)\s*=/g)].map(([, name]) => name))]
}

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context)
    if (!url.startsWith('file:') || (result.format !== 'module' && result.format !== 'commonjs')) return result
    const source = result.source == null ? readFileSync(fileURLToPath(url), 'utf8') : String(result.source)
    if (!USE_CLIENT.test(source)) return result
    const reference = name => `Object.assign(function ClientReference() {}, { $$typeof: Symbol.for('react.client.reference'), $$id: ${JSON.stringify(`${url}#${name}`)} })`
    const names = exportNames(source, result.format)
    const stub =
      result.format === 'module'
        ? names.map(name => (name === 'default' ? `export default ${reference(name)}` : `export const ${name} = ${reference(name)}`)).join('\n')
        : names.map(name => `exports.${name} = ${reference(name)}`).join('\n')
    return { format: result.format, source: stub, shortCircuit: true }
  },
})
