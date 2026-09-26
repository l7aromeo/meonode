// @vitest-environment node
//
// The React Server Components layer is told apart from every other by the shape of
// the `react` build it loads. Each case imports a fresh module graph, some against
// the genuine `react-server` build, the way a bundler resolves `react` there.
import { createRequire } from 'node:module'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
/** The file `react`'s `react-server` export condition resolves to. */
const REACT_SERVER_ENTRY = path.join(path.dirname(require.resolve('react/package.json')), 'react.react-server.js')

/** Imports `specifier` in a fresh module graph, against the `react-server` build when `reactServer` is set. */
async function importInLayer<T>(specifier: string, reactServer: boolean): Promise<T> {
  vi.resetModules()
  if (reactServer) vi.doMock('react', () => require(REACT_SERVER_ENTRY))
  else vi.doUnmock('react')
  return (await import(specifier)) as T
}

afterEach(() => {
  vi.doUnmock('react')
  vi.resetModules()
})

describe('IS_REACT_SERVER_LAYER', () => {
  it('is false against the react build a server-rendering pass or a browser loads', async () => {
    const { IS_REACT_SERVER_LAYER } = await importInLayer<typeof import('@src/util/react-layer.util.js')>('@src/util/react-layer.util.js', false)
    expect(IS_REACT_SERVER_LAYER).toBe(false)
  })

  it('is true against the react-server build', async () => {
    const { IS_REACT_SERVER_LAYER } = await importInLayer<typeof import('@src/util/react-layer.util.js')>('@src/util/react-layer.util.js', true)
    expect(IS_REACT_SERVER_LAYER).toBe(true)
  })
})
