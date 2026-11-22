import { defineConfig } from 'vitest/config'
import { sourceAliases } from './vitest.aliases'

/**
 * Editing a client component in `next dev` makes Next refresh every page connected
 * to it, so the Fast Refresh test runs on its own, after every other file is done
 * with the server.
 */
const FAST_REFRESH_TEST = './tests/rsc-fast-refresh.test.ts'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
    globalSetup: ['./tests/globalSetup.rsc.ts'],
    teardownTimeout: 120_000,
    testTimeout: 120_000,
    alias: sourceAliases,
    projects: [
      {
        extends: true,
        test: {
          name: 'rsc',
          include: [
            './tests/rsc-integration.test.ts',
            './tests/rsc-theme-script.test.ts',
            './tests/rsc-theme-flicker.test.ts',
            './tests/rsc-streamed-styles.test.ts',
            './tests/rsc-static-css.test.ts',
            './tests/rsc-mutated-styles.test.ts',
            './tests/build-output.test.ts',
            './tests/theme-length-browser.test.ts',
            './tests/dev-mode-environments.test.ts',
          ],
        },
      },
      { extends: true, test: { name: 'fast-refresh', include: [FAST_REFRESH_TEST], sequence: { groupOrder: 1 } } },
    ],
  },
})
