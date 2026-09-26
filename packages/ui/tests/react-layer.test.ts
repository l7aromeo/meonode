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
const CACHE_SYMBOLS = [Symbol.for('@meonode/ui/serverEmotionCache'), Symbol.for('@meonode/ui/serverEmotionDefaultKeyCache')]

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
  for (const symbol of CACHE_SYMBOLS) delete (globalThis as Record<symbol, unknown>)[symbol]
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

describe('the server emotion cache outside a StyleRegistry scope', () => {
  type ServerEmotion = typeof import('@src/util/server-emotion.util.js')
  const keysInOrder = async (first: boolean, second: boolean) => {
    const a = await importInLayer<ServerEmotion>('@src/util/server-emotion.util.js', first)
    const firstKey = a.getServerEmotionCache().key
    const b = await importInLayer<ServerEmotion>('@src/util/server-emotion.util.js', second)
    return [firstKey, b.getServerEmotionCache().key]
  }

  // Both layers run in one process and share `globalThis`, which is where the
  // process-global caches live; each layer keeps its own key whichever loads first.
  it('uses the package key in the server components layer and Emotion’s default elsewhere, server components first', async () => {
    expect(await keysInOrder(true, false)).toEqual(['meonode-css', 'css'])
  })

  it('uses the package key in the server components layer and Emotion’s default elsewhere, server rendering first', async () => {
    expect(await keysInOrder(false, true)).toEqual(['css', 'meonode-css'])
  })
})
