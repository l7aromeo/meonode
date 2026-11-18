import { defineConfig } from 'vitest/config'

// The Flight end-to-end tests. They load the built package, so they run apart from the
// unit suites, which test the sources.
export default defineConfig({
  test: {
    include: ['tests/flight/**/*.flight.ts'],
    testTimeout: 60_000,
  },
})
