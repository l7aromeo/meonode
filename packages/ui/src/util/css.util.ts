import { isSerializedStyles } from '@src/util/css-unit.util.js'

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
export const COMPONENT_SELECTOR_MARK = '__emotion_styles'

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
