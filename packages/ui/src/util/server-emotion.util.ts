import { cache as requestCache } from 'react'
import createCache from '@emotion/cache'
import type { EmotionCache } from '@emotion/cache'
import { serializeStyles } from '@emotion/serialize'
import { getRegisteredStyles, insertStyles } from '@emotion/utils'
import type { CssProp } from '@src/types/node.type.js'
import { IS_REACT_SERVER_LAYER } from '@src/util/react-layer.util.js'

/**
 * The key for a cache no `StyleRegistry` scope provides.
 *
 * Outside the React Server Components layer a server-rendered component is
 * rendered again on the client, by `StyledRenderer` through Emotion, which with
 * no `CacheProvider` above it uses its default cache, keyed `css`. The server
 * uses the same key so both produce the same class. Inside that layer the
 * component never renders on the client, and the package's own key is kept.
 */
const UNSCOPED_CACHE_KEY = IS_REACT_SERVER_LAYER ? 'meonode-css' : 'css'

interface ServerEmotionScope {
  cache: EmotionCache
}

/**
 * The scope the current server render compiles into.
 *
 * `StyleRegistry` opens one per request, before any child renders, and the
 * compile reads it from here because it runs deep inside the tree walk with no
 * React context to read. It is a module-level binding rather than an
 * `AsyncLocalStorage`: React renders one tree synchronously per request in this
 * path, and importing `node:async_hooks` from a module that `StyleRegistry` — a
 * client component — also imports would pull a Node builtin into the browser
 * bundle.
 *
 * `undefined` means no registry opened one: the React Server Components layer,
 * or a server render without `StyleRegistry`. Compiles there use the request's
 * own cache instead.
 */
let activeScope: ServerEmotionScope | undefined

/**
 * Opens a fresh scope for one server render and returns it.
 *
 * Called from `StyleRegistry`'s lazy initializer, which runs once per request
 * before any child renders, so every style compiled below it lands in this
 * scope's cache, which the registry flushes.
 * @returns The scope that subsequent compilation in this render will use.
 */
export function beginServerEmotionScope(): ServerEmotionScope {
  const scope: ServerEmotionScope = { cache: createCache({ key: 'meonode-css' }) }
  activeScope = scope
  return scope
}

/**
 * Closes the current scope, so a later render that opens none compiles into its
 * own request's cache rather than a finished request's.
 * @param scope The scope to close. Ignored when it is no longer the active one,
 * which means another render has already opened its own.
 */
export function endServerEmotionScope(scope: ServerEmotionScope): void {
  if (activeScope === scope) activeScope = undefined
}

/**
 * An emotion cache per request, for renders no registry has opened a scope for.
 *
 * Compat mode keeps each rule's text in `inserted` after its first insert, where
 * otherwise the entry becomes `true`. Every render that compiles a rule carries
 * it, so a second render compiling the same rule in the same request reads its
 * text from there.
 */
const requestEmotionCache = requestCache(() => {
  const emotionCache = createCache({ key: UNSCOPED_CACHE_KEY })
  emotionCache.compat = true
  return emotionCache
})

/**
 * The cache a server compile writes to: the open `StyleRegistry` scope's, or the
 * request's own when there is none.
 * @returns The emotion cache for the current server render.
 */
export function getServerEmotionCache(): EmotionCache {
  return activeScope?.cache ?? requestEmotionCache()
}

/** A server-compiled rule, and whether the caller has to emit it. */
export interface ServerEmotionRule {
  /** The class the element carries. Always present: it is what the markup needs, whatever happens to the rule. */
  className: string
  /** The emotion id: the rule's key in the cache. */
  id: string
  /** The rule's text. Empty only when it could not be recovered, in which case `emit` is false. */
  cssText: string

  /**
   * Whether the caller must render the rule itself, as a hoisted
   * `<style href precedence>`.
   *
   * False inside a `StyleRegistry` scope — the SSR layer — where the rule is
   * registered in that scope's cache and the registry flushes it. Registering
   * there is also what lets emotion-styled components, MUI's among them, merge
   * the class into their own exactly as the client does; compiling anywhere
   * else leaves the server with two classes where the client has one.
   *
   * True with no scope: the RSC layer, or a server render without a registry.
   * Nothing else writes the rule there.
   */
  emit: boolean
}

/**
 * Compiles a css value to a class and says how its rule reaches the page.
 *
 * Takes an object or an array of them — the array is what a non-map `css`
 * resolves to — and produces the class Emotion's `css` prop gives the same input
 * under the same cache key, so server and client output match.
 *
 * The element's own `className` is composed the way Emotion composes it on the
 * client: each class registered in this cache is replaced by its styles, placed
 * after `css` so they win a conflict, and every other class is kept as it is,
 * ahead of the new one. The cache lasts one request in the React Server
 * Components layer and one scope under a `StyleRegistry`; outside both, each call
 * has its own and a class compiled by another call is kept as a plain class.
 * @param css The resolved css for one element.
 * @param className The element's own `className`, if any.
 * @returns The rule, or `undefined` for a value that styles nothing.
 */
export function compileServerEmotionRule(css: CssProp, className?: unknown): ServerEmotionRule | undefined {
  // Only an object or an array of them is compiled; anything else styles nothing.
  if (!css || typeof css === 'string' || typeof css === 'number' || typeof css === 'boolean') return undefined
  const scope = activeScope
  const cache = getServerEmotionCache()
  const styles: unknown[] = [css]
  const otherClasses = typeof className === 'string' ? getRegisteredStyles(cache.registered, styles as string[], className) : ''
  const serialized = serializeStyles(styles as any, cache.registered)
  const stylesForSSR = insertStyles(cache as any, serialized as any, false)
  const cachedStyle = (cache.inserted as Record<string, unknown>)[serialized.name]
  const cssText = typeof stylesForSSR === 'string' ? stylesForSSR : typeof cachedStyle === 'string' ? cachedStyle : undefined
  const ownClass = `${cache.key}-${serialized.name}`
  return { className: `${otherClasses}${ownClass}`, id: serialized.name, cssText: cssText ?? '', emit: !scope && Boolean(cssText) }
}
