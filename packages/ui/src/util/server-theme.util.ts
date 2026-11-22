import type { Theme } from '@src/types/node.type.js'
import {
  CSS_TEXT,
  isCssTextContext,
  isFallbackList,
  isLengthProperty,
  isSerializedRecordKey,
  isSerializedStyles,
  needsLengthVariant,
  themeVarRef,
  toLengthVarName,
  type TokenContext,
  valueContext,
} from '@src/util/css-unit.util.js'
import { isComponentSelector } from '@src/util/css.util.js'
import { isInPrelude } from '@src/util/theme-key.util.js'

function toThemeVarName(path: string): string {
  return `--meonode-theme-${path.replace(/[^\w.-]/g, '-').replace(/\./g, '-')}`
}

/**
 * Records a token's variable, plus its paired length variant when the value is
 * a bare number.
 *
 * A theme value reaches CSS as the text of a custom property, and Emotion never
 * inspects a custom property's contents — so `{ md: 16 }` used for `padding`
 * would emit `padding: 16`, which is not a valid length. Emitting
 * `--…-md--len: 16px` alongside lets a length property reference
 * `var(--…-md--len, var(--…-md))` and get the unit, while `zIndex` and friends
 * keep referencing the plain variable and stay bare.
 * @param entries The accumulating declaration list.
 * @param varName The plain variable name.
 * @param value The raw token value.
 */
function pushEntry(entries: Array<[string, string]>, varName: string, value: string | number | boolean): void {
  entries.push([varName, String(value)])
  if (needsLengthVariant(value)) {
    entries.push([toLengthVarName(varName), `${value}px`])
  }
}

/**
 * Builds the `:root{--meonode-theme-*: …}` CSS text directly from a Theme without
 * touching the server-only variable store. Safe to call on the client for pure
 * SPA flows (Vite/CRA) where there is no SSR emission to pick up.
 */
export function buildThemeVariablesCss(theme: Theme): string {
  if (!theme?.system || typeof theme.system !== 'object') return ''
  const entries: Array<[string, string]> = []
  const stack: Array<{ path: string; value: unknown }> = [{ path: '', value: theme.system }]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || !current.value || typeof current.value !== 'object') continue
    const record = current.value as Record<string, unknown>

    for (const [key, rawValue] of Object.entries(record)) {
      const path = current.path ? `${current.path}.${key}` : key
      if (rawValue === null || rawValue === undefined) continue

      if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
        pushEntry(entries, toThemeVarName(path), rawValue)
        continue
      }

      if (typeof rawValue === 'object') {
        const maybeDefault = (rawValue as Record<string, unknown>).default
        if (typeof maybeDefault === 'string' || typeof maybeDefault === 'number' || typeof maybeDefault === 'boolean') {
          pushEntry(entries, toThemeVarName(path), maybeDefault)
        }
        stack.push({ path, value: rawValue })
      }
    }
  }

  if (entries.length === 0) return ''
  const declarations = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}:${value};`)
    .join('')
  return `:root{${declarations}}`
}

/**
 * Module-level cache so repeat conversions of the same input object/array
 * return their previously-computed output in O(1). The cache stores both
 * `input → output` and `output → output` so that re-running the function
 * on an already-converted value short-circuits without re-walking. WeakMap
 * lets entries be reclaimed automatically when their keys are GC'd.
 */
const conversionCache = new WeakMap<object, unknown>()

/**
 * Hoisted to module scope rather than rebuilt per call. `replaceThemeTokensWithCssVars`
 * runs on every node's props on every render, so allocating a fresh `RegExp` and
 * two closures on entry was pure per-node garbage.
 *
 * Sharing one `/g` regex across calls is safe here: `String.prototype.replace`
 * with a global regex always starts at index 0 and resets `lastIndex` when it
 * finishes, and nothing between the reset and the `replace` yields (no `await`,
 * no generator), so no other call can interleave and observe a stale index. The
 * explicit reset below is belt-and-braces.
 */
const themeRegex = /theme\.([a-zA-Z0-9_.-]+)/g

/**
 * How many strings each cache below keeps, and how many first sightings it
 * remembers. When either is full it is emptied and fills again, so memory never
 * grows past the cap, whatever strings a page writes.
 */
const MAX_CACHED_REWRITES = 512

/**
 * The longest string the caches take. A token value is short; a longer string is
 * usually CSS text, which is rare and could make one entry large.
 */
const MAX_CACHED_LENGTH = 256

/**
 * Rewritten strings by input, for one kind of context. A string is kept only on
 * its second sighting: one seen once is remembered in `seen`, without its rewrite.
 * Strings that are new on every render, such as tokens a template literal builds
 * per row, then never reach `kept`, and cannot push out the strings a page writes
 * on every render.
 */
interface RewriteCache {
  kept: Map<string, string>
  seen: Set<string>
}

const rewriteCache = (): RewriteCache => ({ kept: new Map(), seen: new Set() })

/**
 * One cache per kind of context. An inline call site passes a new props object on
 * every render, so no identity cache holds it, but its strings are the same
 * literals each time. Both rewriters use these: this module's walk, and the
 * client's `ThemeUtil.resolveObjWithTheme` in `vars` mode.
 *
 * A rewrite reads nothing but the string and its context: no theme, no options.
 * Of the context, {@link themeVarRef} reads only whether it names a length
 * property, or, for CSS text, the declaration around each token, which is part of
 * the string. So these three caches cover every context.
 */
const cssTextRewrites = rewriteCache()
const lengthRewrites = rewriteCache()
const valueRewrites = rewriteCache()
const rewriteCaches = [cssTextRewrites, lengthRewrites, valueRewrites]

/** How many strings each cache keeps, and remembers; {@link MAX_CACHED_REWRITES} unless a test sets it. */
let rewriteCacheCap = MAX_CACHED_REWRITES

/**
 * How many rewritten strings the caches keep, and how many first sightings they
 * remember, in all. Each is never more than three times the cap.
 */
export const cachedThemeRewrites = (): { kept: number; seen: number } => ({
  kept: rewriteCaches.reduce((sum, cache) => sum + cache.kept.size, 0),
  seen: rewriteCaches.reduce((sum, cache) => sum + cache.seen.size, 0),
})

/**
 * Empties the caches and sets their cap, so a test can fill one past a small cap,
 * or turn caching off with `0` and compare.
 * @param cap Strings each cache keeps, and first sightings it remembers.
 */
export const setThemeRewriteCacheCap = (cap: number): void => {
  rewriteCacheCap = cap
  for (const cache of rewriteCaches) {
    cache.kept.clear()
    cache.seen.clear()
  }
}

/**
 * Rewrites `theme.*` tokens in a string to CSS variable references. In CSS text a
 * token in a prelude or a selector is left as written, for a resolver that has the
 * theme.
 * @param input The string that may contain `theme.*` tokens.
 * @param context What the string was written against, which decides whether a
 * token takes the paired `--len` variant (see {@link themeVarRef}).
 * @returns The rewritten string, or `input` when it holds no tokens.
 */
export const replaceThemeTokensInString = (input: string, context: TokenContext): string => {
  if (!input.includes('theme.')) return input
  if (input.length > MAX_CACHED_LENGTH) return rewriteString(input, context)
  const cache = context === CSS_TEXT ? cssTextRewrites : context !== undefined && isLengthProperty(context) ? lengthRewrites : valueRewrites
  const cached = cache.kept.get(input)
  if (cached !== undefined) return cached
  const next = rewriteString(input, context)
  if (rewriteCacheCap === 0) return next
  if (cache.seen.delete(input)) {
    if (cache.kept.size >= rewriteCacheCap) cache.kept.clear()
    cache.kept.set(input, next)
  } else {
    if (cache.seen.size >= rewriteCacheCap) cache.seen.clear()
    cache.seen.add(input)
  }
  return next
}

/** {@link replaceThemeTokensInString} without its cache. */
const rewriteString = (input: string, context: TokenContext): string => {
  themeRegex.lastIndex = 0
  // In CSS text a token in a prelude or a selector needs the theme's concrete
  // value, so it is left for the resolver that has the theme. A property's value
  // is never CSS text, so a brace in it opens no block.
  const isCssText = isCssTextContext(context) && input.includes('{')
  let hasChanged = false
  const next = input.replace(themeRegex, (match, path: string, offset: number) => {
    if (isCssText && isInPrelude(input, offset)) return match
    hasChanged = true
    return themeVarRef(toThemeVarName(path), context, input, offset)
  })
  return hasChanged ? next : input
}

/** A plain object the walk enters; an Emotion component selector is not one (see {@link isComponentSelector}). */
const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null) return false
  const proto = Object.getPrototypeOf(v)
  return (proto === null || proto === Object.prototype) && !isComponentSelector(v)
}

/** A container still to be walked, and whether its children have been pushed. */
interface WorkItem {
  value: unknown
  isProcessed: boolean
}

/** Pushes each plain object and array in `items` that is not already on the walk's path. */
const pushContainers = (items: readonly unknown[], workStack: WorkItem[], path: Set<unknown>): void => {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if ((isPlainObject(item) || Array.isArray(item)) && !path.has(item)) workStack.push({ value: item, isProcessed: false })
  }
}

/**
 * Converts the items of an array: a string against `context`, a container to its
 * already converted form. Copy-on-write.
 * @param items The array.
 * @param context What each string item is written against.
 * @param resolvedValues The walk's converted containers.
 * @returns The converted array, or `items` itself when nothing changed.
 */
const convertItems = (items: unknown[], context: TokenContext, resolvedValues: Map<unknown, unknown>): unknown[] => {
  let next: unknown[] | null = null
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    let newItem: unknown = item
    if (typeof item === 'string') {
      newItem = replaceThemeTokensInString(item, context)
    } else if (isPlainObject(item) || Array.isArray(item)) {
      newItem = resolvedValues.get(item) ?? item
    }
    if (newItem !== item) {
      if (next === null) next = [...items]
      next[i] = newItem
    }
  }
  return next ?? items
}

const SCAN_NO_TOKENS = 0
const SCAN_FOUND_OR_UNKNOWN = 1

/**
 * Depth budget for {@link scanForThemeTokens}. Props and `css` objects are
 * shallow in practice (a media-query or pseudo-selector block nests two or three
 * levels), so this is generous. Its real job is to bound recursion: exceeding it
 * means "give up, take the slow path", which is how cyclic structures are
 * handled without allocating a `Set` to track the traversal path.
 */
const SCAN_MAX_DEPTH = 16

/**
 * Read-only, allocation-free test for whether `value` contains any string that
 * needs token conversion.
 *
 * Returns {@link SCAN_NO_TOKENS} only when it has proven there is nothing to
 * convert. Anything else — a token found, or a structure too deep to finish
 * scanning — returns {@link SCAN_FOUND_OR_UNKNOWN}, and the caller falls back to
 * the full copy-on-write walk. Collapsing "found" and "unknown" into one result
 * is intentional: both lead to the same place, and distinguishing them would only
 * invite a caller to treat "unknown" as safe.
 *
 * Mirrors the walk's traversal contract exactly, or it would reach a different
 * conclusion than the walk it is short-circuiting:
 * - Only plain objects and arrays are descended into. Class instances (refs,
 *   `Date`, React elements, MUI internals) are passed through untouched by the
 *   walk, so they cannot hide a convertible string.
 * - Only string **values** count. Keys holding tokens (e.g.
 *   `'@media (max-width: theme.breakpoint.md)'`) are deliberately not converted
 *   by the walk either — they must resolve to concrete values, since CSS
 *   variables are invalid in media features and selector text.
 * - Uses `for...in` + `hasOwnProperty` rather than `Object.values()`, because
 *   `Object.values()` allocates an array per object, which is one of the costs
 *   this path exists to avoid.
 * - Emotion's record in serialized styles is skipped, as the walk skips it
 *   (see {@link isSerializedRecordKey}).
 */
function scanForThemeTokens(value: unknown, depth: number): number {
  if (typeof value === 'string') {
    return value.includes('theme.') ? SCAN_FOUND_OR_UNKNOWN : SCAN_NO_TOKENS
  }
  if (typeof value !== 'object' || value === null) return SCAN_NO_TOKENS
  if (depth >= SCAN_MAX_DEPTH) return SCAN_FOUND_OR_UNKNOWN

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (scanForThemeTokens(value[i], depth + 1) !== SCAN_NO_TOKENS) return SCAN_FOUND_OR_UNKNOWN
    }
    return SCAN_NO_TOKENS
  }

  if (!isPlainObject(value)) return SCAN_NO_TOKENS

  const serialized = isSerializedStyles(value)
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key) || (serialized && isSerializedRecordKey(key))) continue
    if (scanForThemeTokens(value[key], depth + 1) !== SCAN_NO_TOKENS) return SCAN_FOUND_OR_UNKNOWN
  }
  return SCAN_NO_TOKENS
}

/**
 * Replaces `theme.*` token strings with `var(--meonode-theme-*)` references,
 * walking arbitrary structures iteratively with copy-on-write semantics.
 *
 * Mirrors `ThemeUtil.resolveObjWithTheme`'s traversal contract:
 * - Only descends into plain objects and arrays. Class instances (refs,
 *   Date, RegExp, MUI internals, React elements, etc.) are passed through
 *   untouched so their identity and prototype chain are preserved.
 * - Copy-on-write: untouched subtrees keep their original reference, which
 *   matters when forwarding props to memoized components.
 * - Iterative with a manual work stack — safe for deeply nested trees.
 * - Detects cycles via a path Set.
 * - Only transforms string **values**, never object keys. Keys that hold
 *   theme tokens (e.g. `'@media (max-width: theme.breakpoint.md)'`) must
 *   resolve to concrete values, since CSS variables are invalid inside
 *   media features and selector text. Key resolution is left to
 *   `ThemeUtil.resolveObjWithTheme`, which has access to the live theme.
 * - Memoized via a module-level WeakMap so the same input reference (e.g.
 *   a `sx` object defined outside a render body) is converted at most once.
 */
export function replaceThemeTokensWithCssVars<T>(value: T): T {
  if (typeof value === 'string') return replaceThemeTokensInString(value, CSS_TEXT) as unknown as T
  if (!isPlainObject(value) && !Array.isArray(value)) return value

  // WeakMap fast-path: previously-converted inputs (and their outputs) hit O(1).
  const cached = conversionCache.get(value as object)
  if (cached !== undefined) return cached as T

  // Allocation-free fast path. The full walk below allocates a work-stack entry
  // per container, a Map, a Set, and an `Object.values()` array per object —
  // before it can discover there was nothing to convert. Since this function
  // runs on every node's props on every render, and since `@meonode/compiler`
  // now rewrites `theme.*` tokens at build time (so compiled call sites arrive
  // already token-free), the overwhelmingly common case is a walk that finds
  // nothing and returns its input unchanged.
  //
  // `scanForThemeTokens` answers "is there anything to do?" with zero
  // allocations. When the answer is no we return the input as-is, which is
  // exactly what the walk would have produced: it is copy-on-write, so an
  // unchanged structure already comes back by reference.
  //
  // Deliberately not cached: the fast path's inputs are mostly fresh per-render
  // objects (compiled `__meo$c`/`__meo$d` buckets, and the spread literal built
  // at core.node.ts's `elementProps`), so a WeakMap insert here would cost more
  // than the O(1) hit it could ever earn, and would retain those objects until
  // the next GC.
  if (scanForThemeTokens(value, 0) === SCAN_NO_TOKENS) return value

  const workStack: WorkItem[] = [{ value, isProcessed: false }]
  const resolvedValues = new Map<unknown, unknown>()
  const path = new Set<unknown>()

  while (workStack.length > 0) {
    const currentWork = workStack[workStack.length - 1]
    const currentValue = currentWork.value

    if (!isPlainObject(currentValue) && !Array.isArray(currentValue)) {
      workStack.pop()
      continue
    }

    if (resolvedValues.has(currentValue)) {
      workStack.pop()
      continue
    }

    if (!currentWork.isProcessed) {
      currentWork.isProcessed = true
      path.add(currentValue)

      if (Array.isArray(currentValue)) {
        pushContainers(currentValue, workStack, path)
      } else {
        const obj = currentValue as Record<string, unknown>
        const keys = Object.keys(obj)
        for (let i = keys.length - 1; i >= 0; i--) {
          const child = obj[keys[i]]
          // A property's fallback list is converted with its key below, not
          // as a container of its own, so only what it holds is walked.
          if (isFallbackList(keys[i], child)) pushContainers(child, workStack, path)
          else if ((isPlainObject(child) || Array.isArray(child)) && !path.has(child)) workStack.push({ value: child, isProcessed: false })
        }
      }
    } else {
      workStack.pop()
      path.delete(currentValue)

      let finalValue: unknown = currentValue

      if (Array.isArray(currentValue)) {
        finalValue = convertItems(currentValue, CSS_TEXT, resolvedValues)
      } else {
        let newObj: Record<string, unknown> | null = null
        const obj = currentValue as Record<string, unknown>
        const serialized = isSerializedStyles(obj)
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const v = obj[key]
            let newValue: unknown = v

            if (serialized && isSerializedRecordKey(key)) {
              continue
            } else if (typeof v === 'string') {
              newValue = replaceThemeTokensInString(v, valueContext(key, serialized))
            } else if (isFallbackList(key, v)) {
              newValue = convertItems(v, key, resolvedValues)
            } else if (isPlainObject(v) || Array.isArray(v)) {
              newValue = resolvedValues.get(v) ?? v
            }

            if (newValue !== v) {
              if (newObj === null) newObj = { ...obj }
              newObj[key] = newValue
            }
          }
        }
        if (newObj !== null) finalValue = newObj
      }

      resolvedValues.set(currentValue, finalValue)
    }
  }

  const result = (resolvedValues.get(value) ?? value) as T
  conversionCache.set(value as object, result)
  // Also map the output to itself so re-converting an already-var-form value
  // (e.g. props that round-trip through this function) short-circuits.
  if (result !== (value as unknown) && typeof result === 'object' && result !== null) {
    conversionCache.set(result as unknown as object, result)
  }
  return result
}
