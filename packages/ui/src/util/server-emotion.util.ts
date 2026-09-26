import { cache as requestCache } from 'react'
import createCache from '@emotion/cache'
import { serializeStyles } from '@emotion/serialize'
import { getRegisteredStyles, insertStyles } from '@emotion/utils'
import type { CssProp } from '@src/types/node.type.js'

/**
 * The emotion cache of one request in the React Server Components layer, the
 * only place a server compile runs. It uses the key `StyleRegistry` gives its own
 * cache, so a server component and a client component with the same css carry
 * the same class.
 *
 * Compat mode keeps each rule's text in `inserted` after its first insert, where
 * otherwise the entry becomes `true`. Every render that compiles a rule carries
 * it, so a second render compiling the same rule in the same request reads its
 * text from there.
 */
const requestEmotionCache = requestCache(() => {
  const emotionCache = createCache({ key: 'meonode-css' })
  emotionCache.compat = true
  return emotionCache
})

/** A server-compiled rule, and whether it has text to emit. */
export interface ServerEmotionRule {
  /** The class the element carries. Always present: it is what the markup needs, whatever happens to the rule. */
  className: string
  /** The emotion id: the rule's key in the cache. */
  id: string
  /** The rule's text. Empty only when it could not be recovered, in which case `emit` is false. */
  cssText: string

  /**
   * Whether there is a rule to render, as a hoisted `<style href precedence>`:
   * false only when the rule's text could not be recovered.
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
 * ahead of the new one. The cache lasts one request, so a class compiled in
 * another request cache — a `'use cache'` scope's — is kept as a plain class.
 * @param css The resolved css for one element.
 * @param className The element's own `className`, if any.
 * @returns The rule, or `undefined` for a value that styles nothing.
 */
export function compileServerEmotionRule(css: CssProp, className?: unknown): ServerEmotionRule | undefined {
  // Only an object or an array of them is compiled; anything else styles nothing.
  if (!css || typeof css === 'string' || typeof css === 'number' || typeof css === 'boolean') return undefined
  const cache = requestEmotionCache()
  const styles: unknown[] = [css]
  const otherClasses = typeof className === 'string' ? getRegisteredStyles(cache.registered, styles as string[], className) : ''
  const serialized = serializeStyles(styles as any, cache.registered)
  const stylesForSSR = insertStyles(cache as any, serialized as any, false)
  const cachedStyle = (cache.inserted as Record<string, unknown>)[serialized.name]
  const cssText = typeof stylesForSSR === 'string' ? stylesForSSR : typeof cachedStyle === 'string' ? cachedStyle : undefined
  const ownClass = `${cache.key}-${serialized.name}`
  return { className: `${otherClasses}${ownClass}`, id: serialized.name, cssText: cssText ?? '', emit: Boolean(cssText) }
}
