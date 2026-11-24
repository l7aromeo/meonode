import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig, type Plugin } from 'vitest/config'
import baseConfig from './vitest.config'
import { sourceAliases } from './vitest.aliases.ts'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/** The package specifier an app imports each entry of the sources by. */
const ENTRY_SPECIFIERS = { main: '@meonode/ui', client: '@meonode/ui/client' } as const

/** An import of an entry by its `@src` path, as the tests write it. */
const ENTRY_IMPORT = /(\bfrom\s*)(['"])@src\/(main|client)\.js\2/g

/** Whether the suites run with the plugin's css extraction on. */
const extractCss = process.env.MEONODE_EXTRACT_CSS === '1'

/** Names a wasm build to compile with instead of the ones found below. */
const WASM_ENV = 'MEONODE_COMPILER_WASM'

/**
 * Where to find the compiler's wasm artifact.
 *
 * `MEONODE_COMPILER_WASM` names one build explicitly. Otherwise prefers the
 * published package, falls back to a sibling checkout so the compiler can be
 * exercised before release. Resolved lazily and reported clearly, because a
 * silently-missing plugin would make this whole config a no-op that reports
 * "all compiled tests pass" while compiling nothing.
 */
function resolveWasm(): string {
  const named = process.env[WASM_ENV]
  if (named) {
    if (!existsSync(named)) throw new Error(`${WASM_ENV} names a wasm that does not exist: ${named}`)
    return named
  }
  const candidates = [
    path.resolve(rootDir, 'node_modules/@meonode/compiler/meonode_swc_plugin.wasm'),
    path.resolve(rootDir, '../compiler/npm/meonode_swc_plugin.wasm'),
  ]
  const found = candidates.find(existsSync)
  if (!found) {
    throw new Error(`Compiled test mode needs the @meonode/compiler wasm artifact. Looked in:\n  ${candidates.join('\n  ')}`)
  }
  return found
}

/**
 * Runs `@meonode/ui` sources and the test files themselves through the real
 * SWC plugin, so every existing suite — theming, memoization, portals, RSC —
 * runs a second time against *compiled* call sites.
 *
 * Both are transformed on purpose. Compiling only `src` would leave the tests
 * constructing nodes the uncompiled way, which is the shape already covered.
 * The point is to exercise the marker contract through the same assertions.
 *
 * The tests import the factories from `@src/main.js` and `@src/client.js`. The
 * plugin compiles them as an app's code is compiled: those imports are given
 * the package specifiers an app imports them by, with the plugin's default
 * options, and the specifiers resolve back to the sources under test.
 * `MEONODE_EXTRACT_CSS=1` turns the plugin's css extraction on as well.
 */
function meonodeCompilerPlugin(): Plugin {
  const wasm = resolveWasm()
  let transformed = 0
  let extracted = 0

  return {
    name: 'meonode-compiler',
    enforce: 'pre',
    async transform(code, id) {
      if (!/\.tsx?$/.test(id)) return null
      if (id.includes('/node_modules/')) return null
      if (!id.includes(`${path.sep}src${path.sep}`) && !id.includes(`${path.sep}tests${path.sep}`)) return null
      // Cheap prefilter: only files that actually construct nodes can compile.
      if (!code.includes('@meonode/ui') && !code.includes('@src/main.js')) return null

      const source = code.replace(
        ENTRY_IMPORT,
        (_, from: string, quote: string, entry: keyof typeof ENTRY_SPECIFIERS) => `${from}${quote}${ENTRY_SPECIFIERS[entry]}${quote}`,
      )
      const { transform } = await import('@swc/core')
      const result = await transform(source, {
        filename: id,
        sourceMaps: true,
        jsc: {
          target: 'es2022',
          parser: { syntax: 'typescript', tsx: id.endsWith('.tsx') },
          experimental: {
            // No `factoryModules`: it would compile the package's own factories
            // as a wrapper library's, props first, which no app gets.
            plugins: [[wasm, extractCss ? { experimental_extractCss: true } : {}]],
          },
        },
      })
      if (result.code.includes('__meo$')) transformed++
      if (result.code.includes('__meo$n')) extracted++
      return { code: result.code, map: result.map }
    },
    buildEnd() {
      // Non-vacuity guard. If the plugin silently compiled nothing, this mode
      // is just a slower copy of the default run and must not pass quietly.
      if (transformed === 0) {
        throw new Error('meonode-compiler transformed no call sites — compiled test mode would be vacuous.')
      }
      // With extraction on, a suite that extracted nothing passes on any runtime.
      if (extractCss && extracted === 0) {
        throw new Error('meonode-compiler extracted no css with MEONODE_EXTRACT_CSS=1 — the run would test the runtime path only.')
      }
      console.log(`[meonode-compiler] emitted markers into ${transformed} file(s)${extractCss ? `, named styles into ${extracted}` : ''}`)
    },
  }
}

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [meonodeCompilerPlugin()],
    resolve: {
      // An array here, not in `test.alias`: mergeConfig would concatenate an
      // array with the base config's object alias and leave an entry with no
      // `find`, which fails every import.
      alias: Object.entries(ENTRY_SPECIFIERS).map(([entry, specifier]) => ({
        find: new RegExp(`^${specifier.replace('/', '\\/')}$`),
        replacement: path.resolve(rootDir, `src/${entry}.ts`),
      })),
    },
    test: {
      // The compiler rewrites `@meonode/ui` factory calls; aliasing `@src`
      // means the library's own sources compile too, not just the tests. The
      // unit suites' aliases, so `@src` resolves to the same `.default` variants.
      alias: sourceAliases,
      // Vitest's module cache keys a transform by the file's source and the
      // config, not by the wasm the config loads, so after a rebuild it would
      // replay what the previous build compiled (#154), or a transform made
      // with extraction the other way.
      fsModuleCache: false,
      // Lets a test tell which mode it is running under. A few assertions are
      // legitimately mode-specific: uncompiled keys are derived from props, so
      // structurally identical nodes share one, while compiled keys come from
      // source position and never do.
      // `MEONODE_EXTRACTED` says the plugin extracted css too: a test's `css`
      // written as a literal is then no longer on the runtime path.
      env: { MEONODE_COMPILED: '1', MEONODE_EXTRACTED: extractCss ? '1' : '' },
    },
  }),
)
