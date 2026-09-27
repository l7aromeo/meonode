// @vitest-environment node
//
// On the server Emotion keeps every rule a cache compiles in a memo shared by all
// caches built on the same plugins array, for the life of the process. Each cache
// meonode creates there is built on an array of its own, so that memo goes with
// the cache instead of growing with every distinct style the process renders.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const created = vi.hoisted(() => ({ caches: [] as { key: string; stylisPlugins?: unknown[] }[] }))

vi.mock('@emotion/cache', async importOriginal => {
  const actual = (await importOriginal()) as { default: (options: { key: string; stylisPlugins?: unknown[] }) => unknown }
  return {
    default: (options: { key: string; stylisPlugins?: unknown[] }) => {
      created.caches.push(options)
      return actual.default(options)
    },
  }
})

beforeEach(() => {
  created.caches = []
})

const { compileServerEmotionRule } = await import('@src/util/server-emotion.util.js')
const { default: StyleRegistry } = await import('@src/components/style-registry.client.js')
const { Div } = await import('@src/main.js')
const { prefixer } = await import('@src/util/emotion-prefixer.util.js')
const { createServerCssCache, SERVER_MEMO_CHARACTERS, SERVER_MEMO_RULES } = await import('@src/util/server-css-cache.util.js')
const { serializeStyles } = await import('@emotion/serialize')

/** The plugins arrays of the caches created with `key`. */
const pluginsOf = (key: string) => created.caches.filter(options => options.key === key).map(options => options.stylisPlugins)

describe('a server Emotion cache meonode creates', () => {
  it('in the React Server Components layer, is built on a plugins array of its own', () => {
    compileServerEmotionRule({ color: 'rgb(1, 2, 3)' })
    compileServerEmotionRule({ color: 'rgb(4, 5, 6)' })
    const [first, second] = pluginsOf('meonode-css')

    expect(first).toEqual([prefixer])
    expect(second).toEqual([prefixer])
    expect(first).not.toBe(second)
  })

  it('in StyleRegistry, is built on a plugins array of its own for each registry', () => {
    const page = (color: string) => StyleRegistry({ children: Div({ css: { color }, children: color }).render() as never })
    renderToString(createElement(() => page('rgb(1, 2, 3)')))
    renderToString(createElement(() => page('rgb(4, 5, 6)')))
    const [first, second] = pluginsOf('meonode-css')

    expect(first).toEqual([prefixer])
    expect(first).not.toBe(second)
  })
})

describe('the css cache for a server subtree with no cache above it', () => {
  /** Compiles `count` distinct rules into `cache`. */
  const compileRules = (cache: ReturnType<typeof createServerCssCache>, count: number, padding = '') => {
    for (let i = 0; i < count; i++) {
      const serialized = serializeStyles([{ color: `rgb(${i % 256}, ${(i >> 8) % 256}, 7)`, content: `"${padding}${i}"` }])
      cache.insert(`.css-${serialized.name}`, serialized, cache.sheet, true)
    }
  }

  it('is the one StyledRenderer provides, with the key and plugin Emotion’s own would have', () => {
    const html = renderToString(Div({ css: { color: 'rgb(1, 2, 3)' }, children: 'x' }).render() as never)
    const [options] = created.caches

    expect(created.caches).toHaveLength(1)
    expect(options).toEqual({ key: 'css', stylisPlugins: [prefixer] })
    expect(html).toMatch(/<style data-emotion="css [a-z0-9]+">\.css-[a-z0-9]+\{[^}]*color:rgb\(1, 2, 3\);\}<\/style><div class="css-[a-z0-9]+">x<\/div>/)
  })

  it('shares its plugins array, and so its memo, with the caches after it', () => {
    createServerCssCache()
    createServerCssCache()
    const [first, second] = pluginsOf('css')

    expect(first).toBe(second)
  })

  it('starts a new plugins array once its generation has compiled its most rules', () => {
    compileRules(createServerCssCache(), SERVER_MEMO_RULES)
    createServerCssCache()
    createServerCssCache()
    const [filled, next, nextAgain] = pluginsOf('css')

    expect(next).not.toBe(filled)
    expect(nextAgain).toBe(next)
  })

  it('starts a new plugins array once its generation has compiled its most characters', () => {
    createServerCssCache()
    compileRules(createServerCssCache(), 1, 'x'.repeat(SERVER_MEMO_CHARACTERS))
    createServerCssCache()
    const plugins = pluginsOf('css')

    expect(plugins.at(-1)).not.toBe(plugins.at(-2))
  })
})
