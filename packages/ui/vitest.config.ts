import { defineConfig } from 'vitest/config'
import { sourceAliases } from './vitest.aliases.ts'
import { SERVER_THEN_BROWSER } from './vitest.server-then-browser.config.ts'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./jest.setup.ts'],
    include: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
    exclude: ['**/node_modules/**', '**/dist/**', ...SERVER_THEN_BROWSER],
    alias: sourceAliases,
  },
})
