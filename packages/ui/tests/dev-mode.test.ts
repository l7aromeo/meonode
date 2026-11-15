import { afterEach, expect, it, vi } from 'vitest'
import { isDevMode, refreshDevMode } from '@src/constant/common.const.js'

afterEach(() => {
  vi.unstubAllEnvs()
  refreshDevMode()
})

it('is on under Vitest, which runs with NODE_ENV=test', () => {
  expect(process.env.NODE_ENV).toBe('test')
  expect(isDevMode()).toBe(true)
})

it('follows a stubbed NODE_ENV once refreshed', () => {
  vi.stubEnv('NODE_ENV', 'production')
  refreshDevMode()
  expect(isDevMode()).toBe(false)

  vi.stubEnv('NODE_ENV', 'development')
  refreshDevMode()
  expect(isDevMode()).toBe(true)
})
