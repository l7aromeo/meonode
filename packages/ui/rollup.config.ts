import { defineConfig, type Plugin, type RollupOptions } from 'rollup'
import alias, { type Alias } from '@rollup/plugin-alias'
import nodeResolve from '@rollup/plugin-node-resolve'
import preserveDirectives from 'rollup-plugin-preserve-directives'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'
import esbuild from 'rollup-plugin-esbuild'
import { globSync, readFileSync } from 'fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
const externalDeps = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {}), ...Object.keys(pkg.devDependencies || {})]

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SRC_DIR = path.resolve(__dirname, 'src')

const input = {
  main: 'src/main.ts',
  client: 'src/client.ts',
  'nextjs-registry/index': 'src/nextjs-registry/index.ts',
}

/**
 * The package ships two builds of the same source:
 *
 * - the default build, `dist/{esm,cjs}`, which the server-rendering pass and the
 *   browser load. It swaps in the `.default` variants of the modules below, so the
 *   code only the React Server Components layer runs folds out of it, the code
 *   only the other layers run stays out of the server build, and its entries
 *   refuse to load in that layer.
 * - the server build, `dist/rsc/{esm,cjs}`, which bundlers load in the React Server
 *   Components layer through the `react-server` export condition.
 *
 * A `'use client'` module exists once, in the default build. The server build
 * imports it from there: a bundler turns that import into a client reference, and
 * the browser must load the same module instance the rest of the client tree
 * imports. A second copy would hold its own React contexts, so a `ThemedRule` the
 * server placed would read a `ThemeContext` no provider fills.
 */
const DEFAULT_BUILD_MODULES: Alias[] = [
  { find: '@src/util/react-layer.util.js', replacement: path.join(SRC_DIR, 'util/react-layer.default.util.ts') },
  { find: '@src/util/server-layer-guard.js', replacement: path.join(SRC_DIR, 'util/server-layer-guard.default.ts') },
  { find: '@src/components/static-styles.js', replacement: path.join(SRC_DIR, 'components/static-styles.default.ts') },
  { find: '@src/util/emotion-cache.util.js', replacement: path.join(SRC_DIR, 'util/emotion-cache.default.util.ts') },
]

const clientModuleCache = new Map<string, boolean>()

/** Whether a source module opens with the `'use client'` directive. */
function isClientModule(id: string): boolean {
  let known = clientModuleCache.get(id)
  if (known === undefined) {
    known = /\.tsx?$/.test(id) && /^['"]use client['"]/.test(readFileSync(id, 'utf8').trimStart())
    clientModuleCache.set(id, known)
  }
  return known
}

/**
 * Every `'use client'` module, as an entry of the default build. The server build
 * imports them from there, so each keeps every export it has: as an ordinary
 * module of the default build, it would lose the ones only the server-layer path
 * uses, such as `ThemedRule`, since that path is folded out of it.
 */
const clientModuleInputs = Object.fromEntries(
  globSync('**/*.ts', { cwd: SRC_DIR })
    .filter(file => isClientModule(path.join(SRC_DIR, file)))
    .map(file => [file.replace(/\.ts$/, ''), `src/${file}`]),
)

/**
 * Resolves every import of a `'use client'` module, in the server build, to that
 * module's file in the default build, as an external the output imports by
 * relative path.
 *
 * Rollup writes an absolute external relative to the importing module's source
 * file, not to its output file. The output tree mirrors `src/`, so the id given
 * is where the default build's file sits relative to the server build's root,
 * placed against `src/`: from `src/components/a.ts` that renders as
 * `../../../esm/components/b.client.js`, which is right from
 * `dist/rsc/esm/components/a.js`.
 * @param format The module format of the build being written.
 */
function sharedClientModules(format: 'esm' | 'cjs'): Plugin {
  const serverRoot = path.join(__dirname, 'dist/rsc', format)
  const defaultRoot = path.join(__dirname, 'dist', format)
  return {
    name: 'shared-client-modules',
    async resolveId(source, importer, options) {
      if (!importer) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved || resolved.external || !resolved.id.startsWith(`${SRC_DIR}${path.sep}`) || !isClientModule(resolved.id)) return null
      const file = path.relative(SRC_DIR, resolved.id).replace(/\.tsx?$/, format === 'esm' ? '.js' : '.cjs')
      return { id: path.join(SRC_DIR, path.relative(serverRoot, path.join(defaultRoot, file))), external: true }
    },
  }
}

function plugins(aliases: Alias[], extra: Plugin[] = []): Plugin[] {
  return [
    ...extra,
    alias({
      entries: [...aliases, { find: '@src', replacement: SRC_DIR }],
    }),
    preserveDirectives(),
    typescript({
      tsconfig: './tsconfig.build.json',
      declaration: false,
      declarationMap: false,
      outDir: undefined,
    }),
    nodeResolve({
      extensions: ['.mjs', '.js', '.json', '.ts', '.tsx'],
    }),
    commonjs(),
    esbuild({
      target: 'ESNext',
      sourceMap: true,
      tsconfig: path.resolve(__dirname, 'tsconfig.build.json'),
    }),
    terser({
      compress: true,
      mangle: true,
    }),
  ]
}

const shared: Pick<RollupOptions, 'input' | 'external' | 'onwarn'> = {
  input,
  external: (id: string) => {
    // Exclude dependencies and their subpaths
    return externalDeps.some(dep => id === dep || id.startsWith(`${dep}/`))
  },
  onwarn: warning => {
    if (warning.code === 'CIRCULAR_DEPENDENCY') return
    if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
  },
}

const esmOutput = { format: 'esm', preserveModules: true, preserveModulesRoot: 'src', entryFileNames: '[name].js', strict: true } as const
const cjsOutput = {
  format: 'cjs',
  preserveModules: true,
  preserveModulesRoot: 'src',
  entryFileNames: '[name].cjs',
  exports: 'named',
  // Read a dependency's default export as its `.default` when it marks itself `__esModule`,
  // and as the whole `module.exports` otherwise. Rollup's default takes `module.exports`
  // as the default every time, which hands `@emotion/cache` and `@emotion/unitless` (both
  // compiled ES modules) their namespace object instead of their default export.
  interop: 'auto',
  strict: true,
} as const

/** The server build, one format at a time: each imports the default build's `'use client'` files of its own format. */
const serverBuild = (format: 'esm' | 'cjs'): RollupOptions => ({
  ...shared,
  plugins: plugins([], [sharedClientModules(format)]),
  // Written relative to each output file, so `dist/rsc/esm/core.node.js` imports
  // `../../esm/components/styled-renderer.client.js`.
  makeAbsoluteExternalsRelative: true,
  output: { ...(format === 'esm' ? esmOutput : cjsOutput), dir: `dist/rsc/${format}` },
})

export default defineConfig([
  {
    ...shared,
    input: { ...input, ...clientModuleInputs },
    plugins: plugins(DEFAULT_BUILD_MODULES),
    // The walk in `BaseNode.render` runs inside `try`, and by default Rollup keeps
    // everything there, so the server-layer branch and the modules only it imports
    // would stay. Every `try` in the source uses the value it computes, so none
    // relies on an expression kept only for the error it might throw.
    treeshake: { tryCatchDeoptimization: false },
    output: [
      { ...esmOutput, dir: 'dist/esm' },
      { ...cjsOutput, dir: 'dist/cjs' },
    ],
  },
  serverBuild('esm'),
  serverBuild('cjs'),
])
