import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig, type Plugin } from 'vitest/config'
import baseConfig from './vitest.config'
import { sourceAliases } from './vitest.aliases.ts'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Where to find the compiler's wasm artifact.
 *
 * `MEONODE_COMPILER_WASM` names one explicitly. Otherwise prefers the
 * published package, falls back to a sibling checkout so the compiler can be
 * exercised before release. Resolved lazily and reported
 * clearly, because a silently-missing plugin would make this whole config a
 * no-op that reports "all compiled tests pass" while compiling nothing.
 */
function resolveWasm(): string {
  // A build of the plugin to test against, named explicitly, such as one not yet published.
  const named = process.env.MEONODE_COMPILER_WASM
  if (named) {
    if (!existsSync(named)) throw new Error(`MEONODE_COMPILER_WASM names no file: ${named}`)
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
 */
/** Whether the suites run with the plugin's css extraction on. */
const extractCss = process.env.MEONODE_EXTRACT_CSS === '1'

/**
 * The package's own entries, as the suites import them, and the specifiers an
 * app imports them by. The plugin extracts css only from factories imported by
 * those specifiers, so the suites' imports are rewritten to them before it runs,
 * and they resolve back to the same sources.
 */
const PACKAGE_ENTRIES = [
  { source: '@src/main.js', specifier: '@meonode/ui', file: 'src/main.ts' },
  { source: '@src/client.js', specifier: '@meonode/ui/client', file: 'src/client.ts' },
] as const

/** A static import or re-export of one of the package's entries, by its quoted specifier. */
const ENTRY_IMPORT = /(\bfrom\s*)(['"])(@src\/(?:main|client)\.js)\2/g

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

      const source = code.replace(ENTRY_IMPORT, (_, from: string, quote: string, entry: string) => {
        const { specifier } = PACKAGE_ENTRIES.find(candidate => candidate.source === entry)!
        return `${from}${quote}${specifier}${quote}`
      })
      const { transform } = await import('@swc/core')
      const result = await transform(source, {
        filename: id,
        sourceMaps: true,
        jsc: {
          target: 'es2022',
          parser: { syntax: 'typescript', tsx: id.endsWith('.tsx') },
          experimental: {
            // The library's own sources import factories from `@src/main.js`
            // and friends, which only `factoryModules` makes the plugin trace.
            // `MEONODE_EXTRACT_CSS=1` runs the suites with the plugin's extraction on.
            plugins: [[wasm, { factoryModules: ['@src/main.js', '@src/client.js', '@meonode/ui'], experimental_extractCss: extractCss }]],
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
    test: {
      // Vitest keys its on-disk module cache by each file and the config, not
      // by the wasm or MEONODE_EXTRACT_CSS, so a cached transform from another
      // build of the plugin or with extraction the other way would run instead,
      // and the counts the guards above read would miss every cached file.
      fsModuleCache: false,
      // The compiler rewrites `@meonode/ui` factory calls; aliasing `@src`
      // means the library's own sources compile too, not just the tests.
      // The package's specifiers, which the suites' imports are rewritten to,
      // resolve to its sources, ahead of the installed package.
      alias: [
        ...PACKAGE_ENTRIES.map(entry => ({ find: new RegExp(`^${entry.specifier}$`), replacement: path.resolve(rootDir, entry.file) })),
        ...(sourceAliases as Extract<typeof sourceAliases, readonly unknown[]>),
      ],
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
