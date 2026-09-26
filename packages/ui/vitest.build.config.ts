import { defineConfig } from 'vitest/config'

/**
 * The production-build suite: `next build` + `next start` against the
 * `next-build` fixture. Kept apart from the dev-server suite because it needs a
 * different server lifecycle and a different fixture, not a different runner.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['./tests/rsc-build.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globalSetup: ['./tests/globalSetup.build.ts'],
    teardownTimeout: 60_000,
    testTimeout: 60_000,
    hookTimeout: 300_000,
  },
})
