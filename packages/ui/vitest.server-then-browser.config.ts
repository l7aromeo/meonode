import { defineConfig } from 'vitest/config'
import { sourceAliases } from './vitest.aliases.ts'

/**
 * Suites that load the package twice in one file, once with no document and
 * once in one, the way a server render and the page hydrating it do. Emotion
 * reads whether a document exists as it loads, and its `import` entry wraps a
 * CommonJS build that Node loads once per process; its `module` entry is an ES
 * module build, which `vi.resetModules()` loads again.
 */
export const SERVER_THEN_BROWSER = ['tests/static-css/named-hydration.test.ts']

export default defineConfig({
  ssr: { resolve: { conditions: ['module', 'node', 'development|production'] } },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./jest.setup.ts'],
    include: SERVER_THEN_BROWSER,
    alias: sourceAliases,
  },
})
