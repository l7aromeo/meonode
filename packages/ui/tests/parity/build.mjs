// Builds one side of the parity comparison: the corpus and the page shell,
// transformed with or without the compiler, against one copy of a built
// `@meonode/ui` dist, as an ES module tree for server rendering and a browser
// bundle for hydration.
//
// Every side goes through the same SWC transform; only the plugin differs. Each
// side gets its own copy of its dist inside packages/ui/node_modules/.cache, so
// React and Emotion resolve to the same modules for all of them.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const PACKAGE = join(HERE, '../..')
export const CORPUS = join(HERE, 'corpus')
const require = createRequire(join(PACKAGE, 'package.json'))

/** The package entries a case or the shell may import, and where each lives inside a dist. */
const ENTRIES = {
  '@meonode/ui': 'dist/esm/main.js',
  '@meonode/ui/nextjs-registry': 'dist/esm/nextjs-registry/index.js',
  '@meonode/mui': 'mui/esm/main.js',
}

/** Where `@meonode/ui` lives in a dist for the server-component layer. */
const RSC_ENTRIES = { ...ENTRIES, '@meonode/ui': 'dist/rsc/esm/main.js' }

/** Whether a case renders as a server component (`render: 'rsc'` in its meta). */
export const isRscCase = name => /\brender:\s*'rsc'/.test(readFileSync(join(CORPUS, `${name}.case.ts`), 'utf8'))

/** The names a minified or plain ES module exports. */
function exportNames(code) {
  const names = []
  for (const [, list] of code.matchAll(/export\s*\{([^}]*)\}/g)) for (const part of list.split(',')) names.push(part.trim().split(/\s+as\s+/).pop())
  for (const [, name] of code.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.push(name)
  if (/export\s+default\b/.test(code)) names.push('default')
  return names.filter(Boolean)
}

/** Every module in a side's ES module dist that opens with 'use client', by file. */
function clientModuleFiles(dir) {
  const files = []
  const walk = d => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const file = join(d, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.name.endsWith('.js') && /^\s*["']use client["']/.test(readFileSync(file, 'utf8'))) files.push(file)
    }
  }
  walk(join(dir, 'dist/esm'))
  return files
}

/** The built @meonode/mui every side shares; each copy imports its own side's @meonode/ui. */
const MUI_DIST = join(PACKAGE, '../mui/dist/esm')

/**
 * Copies the @meonode/mui dist into a side, with its `@meonode/ui` imports
 * pointed at that side's dist copy, so mui components render through the
 * side's own runtime.
 */
function copyMui(dir) {
  if (!existsSync(join(MUI_DIST, 'main.js'))) throw new Error(`${MUI_DIST} has no build: run \`bun run build:mui\` at the repository root`)
  const out = join(dir, 'mui/esm')
  cpSync(MUI_DIST, out, { recursive: true, filter: src => !src.endsWith('.map') })
  const ui = join(dir, ENTRIES['@meonode/ui'])
  const walk = d => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const file = join(d, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.name.endsWith('.js')) {
        const code = readFileSync(file, 'utf8')
        if (!code.includes("'@meonode/ui'")) continue
        let target = relative(dirname(file), ui)
        if (!target.startsWith('.')) target = `./${target}`
        writeFileSync(file, code.replaceAll("'@meonode/ui'", `'${target}'`))
      }
    }
  }
  walk(out)
}

/**
 * Next's navigation module, which the registry imports, reads `process.env`
 * keys beyond NODE_ENV in the browser bundle; a bundler for Next defines them.
 */
const PROCESS_SHIM = 'var process = globalThis.process || { env: { NODE_ENV: "production" } };'

/**
 * Compiler options a module adds for itself, from a first-line comment
 * `// parity-compiler-options: <JSON>`, merged over the side's options; as an
 * app's compiler configuration (factoryModules) applies to every side alike.
 */
const OPTIONS_PRAGMA = /^\/\/ parity-compiler-options: (.+)$/m

/** A side's plugin with a module's own compiler options merged in. */
function pluginFor(plugin, source) {
  const pragma = source.match(OPTIONS_PRAGMA)
  return plugin && pragma ? [plugin[0], { ...plugin[1], ...JSON.parse(pragma[1]) }] : plugin
}

/** An import specifier, from a side's directory, for a package entry inside its dist copy. */
const relativeEntry = (dir, specifier) => `./${ENTRIES[specifier]}`

/** The corpus case names, sorted: the written ones, then the generated ones as `generated/<name>`. */
export function caseNames() {
  const list = dir =>
    existsSync(dir)
      ? readdirSync(dir)
          .filter(f => f.endsWith('.case.ts'))
          .map(f => f.slice(0, -'.case.ts'.length))
          .sort()
      : []
  return [...list(CORPUS), ...list(join(CORPUS, 'generated')).map(name => `generated/${name}`)]
}

/**
 * Transforms one TypeScript module with SWC, and points its package imports at
 * the side's dist copy.
 * @param file The source file.
 * @param plugin `[wasm, options]`, or null for the runtime side.
 * @param out The output file.
 * @param distRoot The side's dist copy root, which holds `dist/`.
 * @returns The output code.
 */
async function transformModule(file, plugin, out, distRoot, entries = ENTRIES) {
  const { transform } = require('@swc/core')
  const source = readFileSync(file, 'utf8')
  plugin = pluginFor(plugin, source)
  const result = await transform(source, {
    filename: file,
    jsc: {
      target: 'es2022',
      parser: { syntax: 'typescript' },
      ...(plugin ? { experimental: { plugins: [plugin] } } : {}),
    },
    module: { type: 'es6' },
  })
  // Relative imports between the transformed modules, which are written as .mjs.
  let code = result.code.replace(/(from|import) '(\.\.?\/[^']+)\.js'/g, "$1 '$2.mjs'")
  for (const [specifier, entry] of Object.entries(entries)) {
    let target = relative(dirname(out), join(distRoot, entry))
    if (!target.startsWith('.')) target = `./${target}`
    code = code.replaceAll(`'${specifier}'`, `'${target}'`).replaceAll(`"${specifier}"`, `'${target}'`)
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, code)
  return code
}

/**
 * Builds a side into packages/ui/node_modules/.cache/parity/<name>.
 * @param side `{ name, ui, plugin, rewrite? }`: the packages/ui dir whose dist to use, `[wasm, options]` or null, and a rewrite of its compiled case and part modules (a planted compiler bug).
 * @param names The case names to build.
 * @returns `{ dir, compiled, parts }`: the side's directory, each case's compiled module text, and each part module's.
 */
export async function buildSide(side, names) {
  const dir = join(PACKAGE, 'node_modules/.cache/parity', side.name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  if (!existsSync(join(side.ui, 'dist/esm/main.js'))) throw new Error(`${side.ui} has no built dist: run \`bun run build:ui\` at the repository root`)
  cpSync(join(side.ui, 'dist'), join(dir, 'dist'), { recursive: true })
  copyMui(dir)
  if (side.plugin && !existsSync(side.plugin[0])) throw new Error(`no compiler wasm at ${side.plugin[0]}: run \`bun run build:compiler\``)

  await transformModule(join(HERE, 'shell.ts'), side.plugin, join(dir, 'shell.mjs'), dir)
  await transformModule(join(HERE, 'shell-control.ts'), side.plugin, join(dir, 'shell-control.mjs'), dir)
  const compiled = {}
  for (const name of names) compiled[name] = await transformModule(join(CORPUS, `${name}.case.ts`), side.plugin, join(dir, 'corpus', `${name}.mjs`), dir)
  // Modules cases import from corpus/parts, compiled the same way, so a case can span modules.
  const parts = join(CORPUS, 'parts')
  const compiledParts = {}
  if (existsSync(parts)) {
    for (const file of readdirSync(parts).filter(f => f.endsWith('.ts'))) {
      compiledParts[file.replace(/\.ts$/, '')] = await transformModule(join(parts, file), side.plugin, join(dir, 'corpus/parts', file.replace(/\.ts$/, '.mjs')), dir)
    }
  }
  // A planted compiler bug: the side's compiled case and part modules, rewritten.
  if (side.rewrite) {
    for (const name of names) {
      compiled[name] = side.rewrite(compiled[name])
      writeFileSync(join(dir, 'corpus', `${name}.mjs`), compiled[name])
    }
    for (const name of Object.keys(compiledParts)) {
      compiledParts[name] = side.rewrite(compiledParts[name])
      writeFileSync(join(dir, 'corpus/parts', `${name}.mjs`), compiledParts[name])
    }
  }

  // Server-component cases also build against the rsc entry, for the server
  // layer, beside a shell whose mode control stays a client module.
  const rscNames = names.filter(isRscCase)
  const clientFiles = []
  if (rscNames.length) {
    await transformModule(join(HERE, 'shell.ts'), side.plugin, join(dir, 'rsc/shell.mjs'), dir, RSC_ENTRIES)
    await transformModule(join(HERE, 'shell-control.ts'), side.plugin, join(dir, 'rsc/shell-control.mjs'), dir)
    for (const name of rscNames) await transformModule(join(CORPUS, `${name}.case.ts`), side.plugin, join(dir, 'rsc/corpus', `${name}.mjs`), dir, RSC_ENTRIES)
    clientFiles.push(...clientModuleFiles(dir), join(dir, 'rsc/shell-control.mjs'))
    const clientModules = Object.fromEntries(clientFiles.map(file => [pathToFileURL(file).href, exportNames(readFileSync(file, 'utf8'))]))
    writeFileSync(join(dir, 'rsc/client-modules.json'), JSON.stringify(clientModules))
  }

  const entry = [
    `import { createElement } from 'react'`,
    `import { hydrateRoot, createRoot } from 'react-dom/client'`,
    `import { StyleRegistry } from '${relativeEntry(dir, '@meonode/ui/nextjs-registry')}'`,
    `import { Shell } from './shell.mjs'`,
    ...(rscNames.length ? [`import { use } from 'react'`, `import { createFromReadableStream } from 'react-server-dom-turbopack/client.browser'`] : []),
    ...clientFiles.map((file, i) => `import * as m${i} from './${relative(dir, file)}'`),
    `const clientModules = { ${clientFiles.map((file, i) => `${JSON.stringify(pathToFileURL(file).href)}: m${i}`).join(', ')} }`,
    `globalThis.__turbopack_require__ = id => clientModules[id]`,
    `globalThis.__turbopack_load_by_url__ = () => Promise.resolve()`,
    `const FlightRoot = ({ response }) => use(response)`,
    ...names.map((name, i) => `import * as c${i} from './corpus/${name}.mjs'`),
    `const cases = { ${names.map((name, i) => `${JSON.stringify(name)}: c${i}`).join(', ')} }`,
    `window.__parityErrors = []`,
    `const onRecoverableError = (error, info) => window.__parityErrors.push(String(error?.message ?? error) + (info?.componentStack ? '\\n' + info.componentStack.split('\\n').slice(0, 4).join('\\n') : ''))`,
    `window.__parity = {`,
    `  start(name, registry) {`,
    `    const mod = cases[name]`,
    `    const root = document.getElementById('root')`,
    `    const page = mod.meta.render === 'rsc' ? createElement(FlightRoot, { response: createFromReadableStream(new Response(window.__parityFlight).body) }) : Shell(createElement(mod.App))`,
    `    const element = registry ? createElement(StyleRegistry, null, page) : page`,
    `    if (mod.meta.render === 'client') createRoot(root, { onRecoverableError }).render(element)`,
    `    else hydrateRoot(root, element, { onRecoverableError })`,
    `  },`,
    `}`,
  ].join('\n')
  writeFileSync(join(dir, 'entry.mjs'), entry)
  execFileSync(
    'bun',
    ['build', join(dir, 'entry.mjs'), '--outfile', join(dir, 'client.js'), '--target', 'browser', '--format', 'iife', '--define', 'process.env.NODE_ENV="production"', '--banner', PROCESS_SHIM],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )
  return { dir, compiled, parts: compiledParts }
}
