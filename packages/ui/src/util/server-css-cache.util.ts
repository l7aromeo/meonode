import createCache, { type EmotionCache } from '@emotion/cache'
import { prefixer } from '@src/util/emotion-prefixer.util.js'

/** The most rules the caches of one generation compile before the next generation starts. */
export const SERVER_MEMO_RULES = 10_000

/** The most characters of rule text the caches of one generation compile before the next generation starts. */
export const SERVER_MEMO_CHARACTERS = 2 * 1024 * 1024

/** A plugins array the caches of one generation share, and what they have compiled on it. */
interface Generation {
  plugins: [typeof prefixer]
  rules: number
  characters: number
}

let generation: Generation = { plugins: [prefixer], rules: 0, characters: 0 }

/**
 * A `css` cache for a server subtree with no cache above it: where Emotion's
 * `withEmotionCache` would create one itself, on its default plugins array.
 *
 * Emotion keeps every rule a server cache compiles in a memo shared by all caches
 * built on the same plugins array, for the life of the process. The caches made
 * here share an array for one generation only, so a style rendered again reuses
 * its rule, as with Emotion's own. Once they have compiled
 * {@link SERVER_MEMO_RULES} rules or {@link SERVER_MEMO_CHARACTERS} characters of
 * rule text, the next cache starts a new array, and the old memo goes with the
 * last cache using it.
 *
 * Unlike the request cache of the React Server Components layer and the
 * `StyleRegistry` cache, which each serve a whole render and so reuse a rule
 * within it, one of these serves a single subtree, created fresh on every
 * render. Without a memo shared across them every render would compile each of
 * its styles again.
 * @returns The cache, with the key and class names Emotion's own would have.
 */
export function createServerCssCache(): EmotionCache {
  if (generation.rules >= SERVER_MEMO_RULES || generation.characters >= SERVER_MEMO_CHARACTERS) {
    generation = { plugins: [prefixer], rules: 0, characters: 0 }
  }
  const own = generation
  const cache = createCache({ key: 'css', stylisPlugins: own.plugins })
  const insert = cache.insert
  // Counts every rule compiled for a class new to this cache, a rule another
  // cache of the generation already compiled included, so the bound errs early.
  cache.insert = (...args) => {
    const rules = insert(...args)
    own.rules++
    if (typeof rules === 'string') own.characters += rules.length
    return rules
  }
  return cache
}
