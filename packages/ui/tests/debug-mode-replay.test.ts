// @vitest-environment node
//
// The checks made while the diagnostics load run once they arrive. A
// development check that throws can no longer stop the render it was made in,
// so the replay reports it with console.error, and the rest of the checks still
// run. Production never reaches this: none of its checks throws (see
// `checkCss`). A process gets here only through the seams below, loading in
// production and then reading development.
import type { ReactNode } from 'react'
// Loaded as the test environment loads React, before MeoNode loads in production.
import { renderToString } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
})

/** What a server component receives for a client module's export, which `checkCss` rejects in development. */
const clientReference = Object.assign(
  () => {
    throw new Error('a client reference was called')
  },
  { $$typeof: Symbol.for('react.client.reference') },
)

it('reports a check made before the diagnostics loaded that throws once they do, and throws as before once they have', async () => {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', 'production')
  const { refreshDevMode } = await import('@src/constant/common.const.js')
  const diagnostics = await import('@src/util/diagnostics.util.js')
  const { Div } = await import('@src/main.js')
  expect(diagnostics.loadedDiagnostics()).toBeUndefined()

  vi.stubEnv('NODE_ENV', 'development')
  refreshDevMode()
  const errors: unknown[][] = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args))
  const tree = (): ReactNode => Div({ css: clientReference as never, children: 'x' }).render() as ReactNode

  expect(() => renderToString(tree())).not.toThrow()
  expect(errors).toEqual([])
  await vi.waitFor(() => expect(diagnostics.loadedDiagnostics()).toBeDefined())
  await Promise.resolve()

  const message = '[MeoNode] `css` is a client component or a client module export, which is not a style.'
  expect(errors).toHaveLength(1)
  expect(errors[0][0]).toBe('[MeoNode] A check made before the diagnostics loaded failed.')
  expect(String((errors[0][1] as Error).message)).toContain(message)
  expect(() => renderToString(tree())).toThrow(message)
})
