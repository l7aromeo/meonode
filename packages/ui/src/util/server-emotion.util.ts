import { cache as requestCache } from 'react'
import createCache from '@emotion/cache'
import { prefixer } from '@src/util/emotion-prefixer.util.js'
import { serializeStyles } from '@emotion/serialize'
import { getRegisteredStyles, insertStyles } from '@emotion/utils'
import type { CssProp } from '@src/types/node.type.js'
import { reportUncomposedClass } from '@src/util/theme-diagnostics.util.js'

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
  // Its own plugins array, so the rules Emotion memoizes on the server go with
  // this cache rather than into the process-wide memo for the default plugins.
  const emotionCache = createCache({ key: 'meonode-css', stylisPlugins: [prefixer] })
  emotionCache.compat = true
  return emotionCache
})

/**
 * The styles behind classes handed to components, by class name, for the life of
 * this module instance.
 *
 * A component can receive a class compiled in another request cache: a caller
 * outside a `'use cache'` scope hands its class to a component inside one, whose
 * compile runs in the scope's own cache. Emotion composes a handed class by
 * looking its styles up in the cache, so without this the two would stay separate
 * classes, and which rule won a conflict would depend on stylesheet order. A class
 * name is a hash of its styles, so an entry means the same thing in every request
 * and scope; it carries no request identity.
 *
 * Only classes compiled for a component target are kept — the only ones a
 * component can be handed. The store is bounded, and keeps the most recently used
 * classes: at most {@link SHARED_CLASS_LIMIT} entries and
 * {@link SHARED_STYLES_BYTE_LIMIT} characters of style text, and never a single
 * entry larger than {@link SHARED_STYLES_ENTRY_LIMIT}. An evicted class falls
 * back to being kept as a plain class beside the element's own.
 *
 * It is two generations of half those limits each. New and reused classes go into
 * the current one; when it fills, it becomes the previous one and the previous
 * one is dropped whole. Every operation is constant time, and a class survives at
 * least half the limit of other classes being kept after it.
 */
export const SHARED_CLASS_LIMIT = 10_000
/** The most style text the store keeps in total, in characters. */
export const SHARED_STYLES_BYTE_LIMIT = 4 * 1024 * 1024
/** The largest single entry the store keeps, in characters. */
export const SHARED_STYLES_ENTRY_LIMIT = 64 * 1024

/**
 * A class kept for composing elsewhere: its registered styles, and, for a class
 * whose css holds a theme token in a key, that whole css, which only the client
 * can compile.
 */
interface SharedClass {
  styles: string
  themed?: CssProp
  size: number
}

let currentClasses = new Map<string, SharedClass>()
let currentLength = 0
let previousClasses = new Map<string, SharedClass>()
let previousLength = 0

function keepSharedClass(name: string, entry: SharedClass): void {
  if (currentClasses.size >= SHARED_CLASS_LIMIT / 2 || currentLength + entry.size > SHARED_STYLES_BYTE_LIMIT / 2) {
    previousClasses = currentClasses
    previousLength = currentLength
    currentClasses = new Map()
    currentLength = 0
  }
  currentClasses.set(name, entry)
  currentLength += entry.size
}

function shareClass(name: string, styles: string, themed?: CssProp): void {
  if (currentClasses.has(name)) return
  const size = styles.length + (themed === undefined ? 0 : JSON.stringify(themed).length)
  if (size > SHARED_STYLES_ENTRY_LIMIT) return
  keepSharedClass(name, { styles, themed, size })
}

function sharedClass(name: string): SharedClass | undefined {
  const current = currentClasses.get(name)
  if (current !== undefined) return current
  const previous = previousClasses.get(name)
  if (previous !== undefined) keepSharedClass(name, previous)
  return previous
}

/**
 * The whole css of each class in this request whose css holds a theme token in a
 * key. Composing such a class folds that css, not its registered styles, into
 * the rule the client writes.
 */
const requestThemedClasses = requestCache(() => new Map<string, CssProp>())

/**
 * Registers, in `registered`, every class of this cache's key in `className` that
 * the cache does not know but the store does, so composing it works as it would
 * in the request that compiled it. A class of this key found in neither is
 * reported in development.
 */
function registerSharedClasses(registered: Record<string, string | true>, key: string, className: string, themedClasses: Map<string, CssProp>): void {
  for (const name of className.split(' ')) {
    if (!name.startsWith(`${key}-`) || registered[name] !== undefined) continue
    const entry = sharedClass(name)
    if (entry === undefined) {
      reportUncomposedClass(name)
      continue
    }
    registered[name] = entry.styles
    if (entry.themed !== undefined) themedClasses.set(name, entry.themed)
  }
}

/** Test seam: how many classes the store holds, and how much style text. */
export const __sharedClassStoreSize = (): { entries: number; length: number } => ({
  entries: currentClasses.size + previousClasses.size,
  length: currentLength + previousLength,
})

/** Test seam: empties the store. */
export const __clearSharedClassStore = (): void => {
  currentClasses = new Map()
  previousClasses = new Map()
  currentLength = 0
  previousLength = 0
}

/** A server-compiled rule, and the classes of the element that uses it. */
export interface ServerEmotionRule {
  /**
   * The classes the element carries: every class it was handed that is not
   * registered in this cache, then `ownClassName`. Always present: it is what the
   * markup needs, whatever happens to the rule.
   */
  className: string
  /** The class this rule defines, which names it on the page. */
  ownClassName: string
  /** The emotion id: the rule's key in the cache. */
  id: string
  /** The rule's text. Empty only when it could not be recovered, in which case there is no rule to render. */
  cssText: string

  /**
   * The whole css to compile on the client instead, when a class the element was
   * handed holds a theme token in a key: its own css, then each handed class in
   * order, as Emotion composes them. `cssText` is empty then.
   */
  clientCss?: CssProp
}

/**
 * Compiles a css value to the classes an element carries and the rule behind them.
 *
 * Takes an object or an array of them — the array is what a non-map `css`
 * resolves to — and produces the class Emotion's `css` prop gives the same input
 * under the same cache key, so server and client output match.
 *
 * The element's own `className` is composed the way Emotion composes it on the
 * client: each class registered in this cache is replaced by its styles, placed
 * after `css` so they win a conflict, and every other class is kept as it is,
 * ahead of the new one. A class compiled in another request cache — a `'use
 * cache'` scope's — is found through the shared store when it was compiled for a
 * component, and kept as a plain class when it is not there.
 * @param css The resolved css for one element.
 * @param className The element's own `className`, if any.
 * @param options `share`: keep this rule's class in the shared store, for an
 * element that is a component and so may hand the class on. `identity`: the
 * element's whole css, when `css` is only the part compiled here; the class is
 * named after it, so two elements that differ only in the rest never share one.
 * @returns The rule, or `undefined` for a value that styles nothing.
 */
export function compileServerEmotionRule(css: CssProp, className?: unknown, options?: { share?: boolean; identity?: CssProp }): ServerEmotionRule | undefined {
  // Only an object or an array of them is compiled; anything else styles nothing.
  if (!css || typeof css === 'string' || typeof css === 'number' || typeof css === 'boolean') return undefined
  const cache = requestEmotionCache()
  const themedClasses = requestThemedClasses()
  const styles: unknown[] = [css]
  if (typeof className === 'string') registerSharedClasses(cache.registered as Record<string, string | true>, cache.key, className, themedClasses)
  // A handed class whose css holds a theme token in a key cannot be composed
  // here: the whole composition goes to the client, in Emotion's order.
  if (typeof className === 'string' && className.split(' ').some(name => themedClasses.has(name))) {
    const parts: unknown[] = [options?.identity ?? css]
    let otherClasses = ''
    for (const name of className.split(' ')) {
      const themed = themedClasses.get(name)
      if (themed !== undefined) parts.push(themed)
      else if (cache.registered[name] !== undefined) parts.push(`${cache.registered[name]};`)
      else if (name) otherClasses += `${name} `
    }
    const name = serializeStyles(parts as any, cache.registered).name
    const ownClassName = `${cache.key}-${name}`
    themedClasses.set(ownClassName, parts as CssProp)
    if (options?.share) shareClass(ownClassName, '', parts as CssProp)
    return { className: `${otherClasses}${ownClassName}`, ownClassName, id: name, cssText: '', clientCss: parts as CssProp }
  }
  const otherClasses = typeof className === 'string' ? getRegisteredStyles(cache.registered, styles as string[], className) : ''
  const compiled = serializeStyles(styles as any, cache.registered)
  const serialized = options?.identity ? { ...compiled, name: serializeStyles([options.identity, ...styles.slice(1)] as any, cache.registered).name } : compiled
  const stylesForSSR = insertStyles(cache as any, serialized as any, false)
  const cachedStyle = (cache.inserted as Record<string, unknown>)[serialized.name]
  const cssText = typeof stylesForSSR === 'string' ? stylesForSSR : typeof cachedStyle === 'string' ? cachedStyle : undefined
  const ownClassName = `${cache.key}-${serialized.name}`
  if (options?.identity) themedClasses.set(ownClassName, options.identity)
  if (options?.share) shareClass(ownClassName, serialized.styles, options?.identity)
  return { className: `${otherClasses}${ownClassName}`, ownClassName, id: serialized.name, cssText: cssText ?? '' }
}
