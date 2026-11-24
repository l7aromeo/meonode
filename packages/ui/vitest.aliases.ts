import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AliasOptions } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * How the unit suites resolve the sources: as the default build does, with the
 * `.default` variant of each module `rollup.config.ts` swaps in for it, so a
 * suite runs the code the server-rendering pass and the browser load. A suite
 * of the React Server Components layer loads the server build's variant itself.
 * The specific entries come first: the first that matches wins.
 */
export const sourceAliases: AliasOptions = [
  { find: '@src/components/static-styles.js', replacement: path.resolve(rootDir, 'src/components/static-styles.default.ts') },
  { find: '@src/util/emotion-cache.util.js', replacement: path.resolve(rootDir, 'src/util/emotion-cache.default.util.ts') },
  { find: '@src', replacement: path.resolve(rootDir, 'src') },
  { find: '@tests', replacement: path.resolve(rootDir, 'tests') },
]
