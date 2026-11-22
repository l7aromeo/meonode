// StyleRegistry provides its Emotion cache in the browser too, where nothing
// flushes: `useServerInsertedHTML` only collects on the server. So the browser's
// cache must be Emotion's own, with no insertion bookkeeping on every insert for
// the page's whole life.
import type { EmotionCache } from '@emotion/cache'
import { __unsafe_useEmotionCache as useEmotionCache } from '@emotion/react'
import { createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** Each cache `@emotion/cache` creates, with the `insert` it was created with. */
const created = vi.hoisted(() => [] as { cache: EmotionCache; insert: EmotionCache['insert'] }[])

vi.mock('@emotion/cache', async importOriginal => {
  const original = (await importOriginal()) as { default: (options: never) => EmotionCache }
  return {
    default: (options: never) => {
      const cache = original.default(options)
      created.push({ cache, insert: cache.insert })
      return cache
    },
  }
})

const { default: StyleRegistry } = await import('@src/components/style-registry.client.js')
const { Div, Node } = await import('@src/main.js')

afterEach(() => {
  document.body.innerHTML = ''
})

describe('StyleRegistry in the browser', () => {
  it("provides a cache whose insert is Emotion's own", () => {
    let provided: EmotionCache | null = null
    function ReadCache(): ReactElement {
      provided = useEmotionCache()
      return createElement('span')
    }
    const container = document.body.appendChild(document.createElement('div'))
    act(() => {
      createRoot(container).render(
        createElement(StyleRegistry, null, Div({ css: { color: 'rgb(1, 2, 3)' }, children: Node(ReadCache) }).render() as ReactElement),
      )
    })

    const own = created.find(entry => entry.cache === provided)
    expect(own).toBeDefined()
    expect(provided!.insert).toBe(own!.insert)
    // The styled node above went through it.
    expect(Object.keys(provided!.inserted).length).toBeGreaterThan(0)
  })
})
