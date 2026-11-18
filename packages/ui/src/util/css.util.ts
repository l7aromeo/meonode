import { isDevMode } from '@src/constant/common.const.js'
import { isSerializedStyles } from '@src/util/css-unit.util.js'
import { isClientReference } from '@src/helper/react-is.helper.js'

/**
 * Whether a `css` value is a map of rules that can be spread or merged key by key.
 *
 * A plain object qualifies unless it is serialized styles (see
 * {@link isSerializedStyles}). Emotion's `css()` results and `keyframes` values
 * are plain object literals too, but Emotion serialises them from `styles` alone,
 * so a key spread or merged in beside it is silently dropped. A styled component
 * or component selector is no map either (see {@link isComponentSelector}).
 * Arrays, strings and functions are never maps.
 * @param value The `css` value to test.
 * @returns `true` when `value` can be combined key by key.
 */
export function isMergeableCss(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  if (proto !== null && proto !== Object.prototype) return false
  return !isSerializedStyles(value as Record<string, unknown>) && !isComponentSelector(value)
}

/**
 * The property Emotion marks a styled component and a component selector with,
 * and tests for when it serializes styles.
 */
const COMPONENT_SELECTOR_MARK = '__emotion_styles'

/**
 * How deep {@link findNotAStyle} looks. A `css` value nests a few
 * levels (a selector in an at-rule in an array); the bound keeps a cyclic value
 * from recursing without end.
 */
const SELECTOR_SEARCH_MAX_DEPTH = 16

/**
 * Whether `value` is an Emotion styled component or a component selector, by
 * the mark Emotion itself tests for. Either looks like a plain object, or on the
 * server a function, and a styled component refers to itself, so every walk over
 * a style passes one through, neither entering nor calling it, as it does a
 * class instance.
 * @param value Any value.
 * @returns `true` for a styled component or a component selector.
 */
export function isComponentSelector(value: unknown): boolean {
  return (
    (typeof value === 'object' || typeof value === 'function') && value !== null && (value as Record<string, unknown>)[COMPONENT_SELECTOR_MARK] !== undefined
  )
}

const isPlainRecord = (value: object): value is Record<string, unknown> => {
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

/**
 * Where the first value in a `css` value that is not a style sits, and what it
 * is: an Emotion styled component or component selector, or a client reference.
 */
interface NotAStyle {
  /** The access path after `css` (`''`, `[1]`, `["&:hover"]`). */
  path: string
  /** Whether it is a client reference rather than a component selector. */
  clientReference: boolean
}

/**
 * Whether `value` can hold or be something other than a style: an object or a
 * function. A primitive is skipped without a call.
 */
const mayHoldNotAStyle = (value: unknown): value is object => (typeof value === 'object' ? value !== null : typeof value === 'function')

/**
 * Finds the first value in a `css` value that is not a style. Walks plain
 * objects and arrays, as the style walks do, and looks only at values that can
 * be one; a path is built only when one is found. This runs on every styled
 * node in development, so the mark is read before the prototype, and a key's
 * own-ness is checked only for a value the walk enters.
 * @param value The `css` value, or part of it: an object or a function.
 * @param depth Current depth, against {@link SELECTOR_SEARCH_MAX_DEPTH}.
 * @returns Where it sits and what it is, or `undefined` when there is none.
 */
function findNotAStyle(value: object, depth: number): NotAStyle | undefined {
  if (typeof value === 'function') {
    if (isClientReference(value)) return { path: '', clientReference: true }
    return isComponentSelector(value) ? { path: '', clientReference: false } : undefined
  }
  if (Array.isArray(value)) {
    if (depth >= SELECTOR_SEARCH_MAX_DEPTH) return undefined
    for (let i = 0; i < value.length; i++) {
      const item: unknown = value[i]
      if (!mayHoldNotAStyle(item)) continue
      const found = findNotAStyle(item, depth + 1)
      if (found !== undefined) {
        found.path = `[${i}]${found.path}`
        return found
      }
    }
    return undefined
  }
  if ((value as Record<string, unknown>)[COMPONENT_SELECTOR_MARK] !== undefined) return { path: '', clientReference: false }
  if (!isPlainRecord(value) || depth >= SELECTOR_SEARCH_MAX_DEPTH) return undefined
  for (const key in value) {
    const item = value[key]
    if (!mayHoldNotAStyle(item) || !Object.prototype.hasOwnProperty.call(value, key)) continue
    const found = findNotAStyle(item, depth + 1)
    if (found !== undefined) {
      found.path = `[${JSON.stringify(key)}]${found.path}`
      return found
    }
  }
  return undefined
}

/**
 * A factory's `css`, checked once: it is the same object on every call of the
 * factory. Held weakly, and only in development. A call site's `css` is most
 * often a new object on every render, which a set would only grow.
 */
const checkedFactoryCss = new WeakSet<object>()

/**
 * The `css` a factory call last combined from a factory's css and the call
 * site's, both checked, so the node it builds does not walk it again.
 */
let lastCombinedCss: unknown

/**
 * Rejects a value in `css` that is not a style, in development, naming where it
 * sits: an Emotion styled component or component selector, or a client
 * reference, which is how a server component receives a client module's export.
 *
 * None is a style. The style walks pass a styled component or component
 * selector through untouched, as they do a class instance (see
 * {@link isComponentSelector}), and Emotion writes nothing for it; a client
 * reference is never called and resolves to nothing. So in production the rest
 * of the style renders without it: an element missing one rule is better than a
 * page that fails. Only development searches for one, so the mistake is named
 * where it was made.
 * @param css The `css` value as written.
 * @throws In development, when `css` holds a value that is not a style.
 */
export function guardComponentSelectors(css: unknown): void {
  if (!isDevMode() || css === null || (typeof css !== 'object' && typeof css !== 'function') || css === lastCombinedCss) return
  const found = findNotAStyle(css, 0)
  if (found === undefined) return
  throw new Error(
    found.clientReference
      ? `[MeoNode] \`css${found.path}\` is a client component or a client module export, which is not a style. ` +
          'Pass the styles themselves: a style object, or a `css()` result, imported from a module without "use client".'
      : `[MeoNode] \`css${found.path}\` is an Emotion styled component or component selector, which is not a style. ` +
          'Pass the styles themselves: the style object the component was made with, or a `css()` result.',
  )
}

/**
 * {@link guardComponentSelectors} for a factory's `css`, which is walked once.
 * @param css The factory's `css`.
 * @throws In development, when `css` holds a value that is not a style.
 */
export function guardFactoryCss(css: unknown): void {
  if (!isDevMode()) return
  if (css === null || typeof css !== 'object') return guardComponentSelectors(css)
  if (checkedFactoryCss.has(css)) return
  guardComponentSelectors(css)
  checkedFactoryCss.add(css)
}

/**
 * Records the `css` a factory call combined from a factory's css and the call
 * site's, both checked, so the node it builds does not walk it again: combining
 * styles adds no value that is not one. Development only.
 * @param css The combined `css` value.
 */
export function markCombinedCssChecked(css: unknown): void {
  if (isDevMode()) lastCombinedCss = css
}
