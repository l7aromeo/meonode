import createCache from '@emotion/cache'
import type { EmotionCache } from '@emotion/cache'
import { serializeStyles } from '@emotion/serialize'
import { insertStyles } from '@emotion/utils'
import { getGlobalState } from '@src/helper/common.helper.js'
import type { CssProp } from '@src/types/node.type.js'

const SERVER_EMOTION_CACHE_KEY = Symbol.for('@meonode/ui/serverEmotionCache')
const SERVER_EMOTION_RULES_KEY = Symbol.for('@meonode/ui/serverEmotionRules')

interface ServerEmotionRulesState {
  byId: Map<string, string>
}

interface ServerEmotionScope {
  cache: EmotionCache
  rules: ServerEmotionRulesState
}

/**
 * The scope the current server render reads and writes.
 *
 * A render collects its styles by *mutating* an Emotion cache, so the cache has
 * to be reachable from `compileServerEmotionClassName`, which runs deep inside
 * the tree walk with no React context to read from. Reaching for a
 * process-global was the obvious way to do that and the wrong one: one cache
 * shared by every request accumulates every style the process has ever
 * rendered, and `StyleRegistry` flushes all of it into every response. A page
 * needing 32 KB of CSS was shipping 166 KB, growing towards the union of the
 * whole site as more routes were hit.
 *
 * `StyleRegistry` now opens a scope per request and this holds it for the
 * duration of that render. It is a module-level binding rather than an
 * `AsyncLocalStorage` on purpose: React renders one tree synchronously per
 * request in this path, and importing `node:async_hooks` from a module that
 * `StyleRegistry` — a client component — also imports would pull a Node
 * builtin into the browser bundle.
 *
 * `undefined` means no scope was opened, which is the case for a server render
 * that never mounts `StyleRegistry`. The process-global is the fallback there,
 * preserving the previous behaviour rather than silently dropping styles.
 */
let activeScope: ServerEmotionScope | undefined

/**
 * Opens a fresh scope for one server render and returns it.
 *
 * Called from `StyleRegistry`'s lazy initializer, which runs once per request
 * before any child renders, so every style compiled below it lands here rather
 * than in the process-global.
 * @returns The scope that subsequent compilation in this render will use.
 */
export function beginServerEmotionScope(): ServerEmotionScope {
  const scope: ServerEmotionScope = { cache: createCache({ key: 'meonode-css' }), rules: { byId: new Map<string, string>() } }

  // Adopt whatever this request already compiled before the scope existed.
  //
  // `StyleRegistry` is a client component, so it renders in the SSR pass —
  // after the server components above it have already rendered and compiled
  // their own `css` through the fallback. A server page styling a node with
  // theme tokens does exactly that, and scoping without this step drops those
  // rules on the floor: the class lands in the markup and its declaration
  // never reaches the document.
  //
  // Draining rather than copying keeps them from being adopted twice by a
  // later render.
  const pending = getGlobalState(SERVER_EMOTION_RULES_KEY, () => ({ byId: new Map<string, string>() }))
  for (const [id, cssText] of pending.byId) scope.rules.byId.set(id, cssText)
  pending.byId.clear()

  activeScope = scope
  return scope
}

/**
 * Closes the current scope, so a later render that opens none falls back to the
 * process-global rather than inheriting a finished request's cache.
 * @param scope The scope to close. Ignored when it is no longer the active one,
 * which means another render has already opened its own.
 */
export function endServerEmotionScope(scope: ServerEmotionScope): void {
  if (activeScope === scope) activeScope = undefined
}

export function getServerEmotionCache(): EmotionCache {
  return activeScope?.cache ?? getGlobalState(SERVER_EMOTION_CACHE_KEY, () => createCache({ key: 'meonode-css' }))
}

function getServerEmotionRulesState(): ServerEmotionRulesState {
  return activeScope?.rules ?? getGlobalState(SERVER_EMOTION_RULES_KEY, () => ({ byId: new Map<string, string>() }))
}

/**
 * Compiles an Emotion-compatible css object to a stable className in server paths
 * without relying on @emotion/react runtime APIs.
 */
export function compileServerEmotionClassName(css: CssProp): string | undefined {
  if (!css || typeof css === 'string' || typeof css === 'number' || typeof css === 'boolean') {
    return undefined
  }

  const cache = getServerEmotionCache()
  const serialized = serializeStyles([css as any], cache.registered)
  const stylesForSSR = insertStyles(cache as any, serialized as any, false)
  const cachedStyle = (cache.inserted as Record<string, unknown>)[serialized.name]
  const cssText = typeof stylesForSSR === 'string' ? stylesForSSR : typeof cachedStyle === 'string' ? cachedStyle : undefined

  if (cssText) {
    const state = getServerEmotionRulesState()
    if (!state.byId.has(serialized.name)) {
      state.byId.set(serialized.name, cssText)
    }
  }

  return `${cache.key}-${serialized.name}`
}

/**
 * Consumes pending server-compiled Emotion rules for injection into SSR output.
 * Rules are drained so each request only emits newly added styles once.
 */
export function consumeServerEmotionRules(): Array<{ id: string; cssText: string }> {
  const state = getServerEmotionRulesState()
  if (state.byId.size === 0) return []

  const drained = Array.from(state.byId.entries()).map(([id, cssText]) => ({ id, cssText }))
  state.byId.clear()
  return drained
}
