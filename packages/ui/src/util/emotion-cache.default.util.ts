import type { EmotionCache } from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { type Context, use } from 'react'
import { providedWalkContexts } from '@src/util/walk-contexts.util.js'

/**
 * The Emotion cache the elements of a render go under, read while it renders,
 * in the default build. From React 19, `CacheProvider` is the context object
 * itself, which `use` reads without a fiber of its own, and may read
 * conditionally. The server build swaps in `emotion-cache.util.ts`.
 * @returns The cache of the nearest `CacheProvider`, or Emotion's default for
 * where it renders: a cache keyed `css` in the browser, `null` on the server.
 * `undefined` when the render runs outside a component's render, where `use`
 * cannot be called and no cache can be known.
 */
export function readEmotionCache(): EmotionCache | null | undefined {
  // Handed in by the component around a walk that runs where no hook may be called.
  const provided = providedWalkContexts()
  if (provided) return provided.cache
  try {
    return use(CacheProvider as unknown as Context<EmotionCache | null>)
  } catch {
    return undefined
  }
}
