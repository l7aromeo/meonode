#!/usr/bin/env node

/**
 * Prints the absolute path to vitest's `vitest.mjs` entry.
 *
 * The test scripts launch that file through `node` directly rather than
 * through the `vitest` bin, because they need `--stack-size`, which Node
 * refuses to read from `NODE_OPTIONS`. They used to hard-code
 * `./node_modules/vitest/vitest.mjs`, which only holds when vitest is
 * installed directly under this package — true for a standalone repo, false
 * in the monorepo, where the hoisting linker puts it in the root
 * `node_modules` instead.
 *
 * `vitest.mjs` is not listed in vitest's `exports`, so it cannot be resolved
 * directly, but `vitest/package.json` is — so resolve that and walk to its
 * sibling. That follows Node's own resolution and therefore keeps working
 * wherever the package actually lands, hoisted or nested.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
process.stdout.write(join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs'))
