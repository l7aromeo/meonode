import createCache, { type EmotionCache } from '@emotion/cache'
import { prefixer } from '@src/util/emotion-prefixer.util.js'
import { reportSharedStyleName } from '@src/util/theme-diagnostics.util.js'

/** The most rules the caches of one generation compile before the next generation starts. */
export const SERVER_MEMO_RULES = 10_000

/** The most characters of rule text the caches of one generation compile before the next generation starts. */
export const SERVER_MEMO_CHARACTERS = 2 * 1024 * 1024

/**
 * A plugins array the caches of one generation share, what they have compiled on
 * it, and the styles each name was first compiled from.
 */
interface Generation {
  plugins: [typeof prefixer]
  rules: number
  characters: number
  styles: Map<string, string>
}

const newGeneration = (): Generation => ({ plugins: [prefixer], rules: 0, characters: 0, styles: new Map() })

let generation: Generation = newGeneration()

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
 *
 * Emotion's memo trusts a name. The generation also keeps the styles each name
 * was first compiled from, and compiles any other styles under that name apart.
 * @returns The cache, with the key Emotion's own would have.
 */
export function createServerCssCache(): EmotionCache {
  if (generation.rules >= SERVER_MEMO_RULES || generation.characters >= SERVER_MEMO_CHARACTERS) {
    generation = newGeneration()
  }
  const own = generation
  const cache = createCache({ key: 'css', stylisPlugins: own.plugins })
  const insert = cache.insert
  // Counts every rule compiled for a class new to this cache, a rule another
  // cache of the generation already compiled included, so the bound errs early.
  cache.insert = (selector, serialized, sheet, shouldCache) => {
    // Emotion's memo returns the rule first compiled under a name. A name the
    // generation holds for other styles gets its rule from a cache of its own,
    // whose memo is not the generation's.
    const held = own.styles.get(serialized.name)
    let rules: string | void
    if (held !== undefined && held !== serialized.styles) {
      reportSharedStyleName(serialized.name)
      rules = createCache({ key: cache.key, stylisPlugins: [prefixer] }).insert(selector, serialized, sheet, false)
      if (shouldCache) cache.inserted[serialized.name] = true
    } else {
      if (held === undefined) own.styles.set(serialized.name, serialized.styles)
      rules = insert(selector, serialized, sheet, shouldCache)
    }
    own.rules++
    if (typeof rules === 'string') own.characters += rules.length
    return rules
  }
  return cache
}
