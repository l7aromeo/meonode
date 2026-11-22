import { defineConfig } from 'vitest/config'
import { sourceAliases } from './vitest.aliases'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./jest.setup.ts'],
    include: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    alias: sourceAliases,
  },
})
