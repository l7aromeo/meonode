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
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const PACKAGE = join(HERE, '../..')
export const CORPUS = join(HERE, 'corpus')
const require = createRequire(join(PACKAGE, 'package.json'))

/** The package entries a case or the shell may import, and where each lives inside a dist. */
const ENTRIES = {
  '@meonode/ui': 'dist/esm/main.js',
  '@meonode/ui/nextjs-registry': 'dist/esm/nextjs-registry/index.js',
}

/**
 * Next's navigation module, which the registry imports, reads `process.env`
 * keys beyond NODE_ENV in the browser bundle; a bundler for Next defines them.
 */
const PROCESS_SHIM = 'var process = globalThis.process || { env: { NODE_ENV: "production" } };'

/** An import specifier, from a side's directory, for a package entry inside its dist copy. */
const relativeEntry = (dir, specifier) => `./${ENTRIES[specifier]}`

/** The corpus case names, sorted. */
export function caseNames() {
  return readdirSync(CORPUS)
    .filter(f => f.endsWith('.case.ts'))
    .map(f => f.slice(0, -'.case.ts'.length))
    .sort()
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
async function transformModule(file, plugin, out, distRoot) {
  const { transform } = require('@swc/core')
  const result = await transform(readFileSync(file, 'utf8'), {
    filename: file,
    jsc: {
      target: 'es2022',
      parser: { syntax: 'typescript' },
      ...(plugin ? { experimental: { plugins: [plugin] } } : {}),
    },
    module: { type: 'es6' },
  })
  // Relative imports between the transformed modules, which are written as .mjs.
  let code = result.code.replace(/from '(\.\.?\/[^']+)\.js'/g, "from '$1.mjs'")
  for (const [specifier, entry] of Object.entries(ENTRIES)) {
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
 * @param side `{ name, ui, plugin }`: the packages/ui dir whose dist to use, and `[wasm, options]` or null.
 * @param names The case names to build.
 * @returns `{ dir, compiled }`: the side's directory, and each case's compiled module text.
 */
export async function buildSide(side, names) {
  const dir = join(PACKAGE, 'node_modules/.cache/parity', side.name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  if (!existsSync(join(side.ui, 'dist/esm/main.js'))) throw new Error(`${side.ui} has no built dist: run \`bun run build:ui\` at the repository root`)
  cpSync(join(side.ui, 'dist'), join(dir, 'dist'), { recursive: true })
  if (side.plugin && !existsSync(side.plugin[0])) throw new Error(`no compiler wasm at ${side.plugin[0]}: run \`bun run build:compiler\``)

  await transformModule(join(HERE, 'shell.ts'), side.plugin, join(dir, 'shell.mjs'), dir)
  const compiled = {}
  for (const name of names) compiled[name] = await transformModule(join(CORPUS, `${name}.case.ts`), side.plugin, join(dir, 'corpus', `${name}.mjs`), dir)

  const entry = [
    `import { createElement } from 'react'`,
    `import { hydrateRoot, createRoot } from 'react-dom/client'`,
    `import { StyleRegistry } from '${relativeEntry(dir, '@meonode/ui/nextjs-registry')}'`,
    `import { Shell } from './shell.mjs'`,
    ...names.map((name, i) => `import * as c${i} from './corpus/${name}.mjs'`),
    `const cases = { ${names.map((name, i) => `${JSON.stringify(name)}: c${i}`).join(', ')} }`,
    `window.__parityErrors = []`,
    `const onRecoverableError = (error, info) => window.__parityErrors.push(String(error?.message ?? error) + (info?.componentStack ? '\\n' + info.componentStack.split('\\n').slice(0, 4).join('\\n') : ''))`,
    `window.__parity = {`,
    `  start(name, registry) {`,
    `    const mod = cases[name]`,
    `    const root = document.getElementById('root')`,
    `    const page = Shell(createElement(mod.App))`,
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
  return { dir, compiled }
}
