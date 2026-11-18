// @vitest-environment node
//
// The entries' guard, in each build's variant. Each case imports a fresh module
// graph, some against the genuine `react-server` build of `react`, the way a
// bundler resolves `react` in the React Server Components layer.
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

describe("the default build's entry guard", () => {
  it('refuses the React Server Components layer, naming the package, the condition and the fix', async () => {
    const { SERVER_LAYER_ENTRY_ERROR } = await importInLayer<typeof import('@src/util/server-layer-guard.default.js')>(
      '@src/util/server-layer-guard.default.js',
      false,
    )
    expect(SERVER_LAYER_ENTRY_ERROR).toContain('@meonode/ui')
    expect(SERVER_LAYER_ENTRY_ERROR).toContain('`react-server` export condition')
    expect(SERVER_LAYER_ENTRY_ERROR).toContain('package name')
    expect(SERVER_LAYER_ENTRY_ERROR).toContain('dist/')

    await expect(importInLayer('@src/util/server-layer-guard.default.js', true)).rejects.toThrow(SERVER_LAYER_ENTRY_ERROR)
  })

  it('loads against the react build a server-rendering pass or a browser loads', async () => {
    await expect(importInLayer('@src/util/server-layer-guard.default.js', false)).resolves.toBeDefined()
  })
})

describe("the server build's entry guard", () => {
  // `react-server-layer.test.ts` loads the whole main entry in that layer.
  it('loads in the React Server Components layer, which is the layer it is for', async () => {
    await expect(importInLayer('@src/util/server-layer-guard.js', true)).resolves.toBeDefined()
  })
})
