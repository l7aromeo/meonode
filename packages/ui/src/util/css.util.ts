/**
 * Whether a `css` value is a map of rules that can be spread or merged key by key.
 *
 * A plain object qualifies unless it carries a string `styles`. Emotion's `css()`
 * results and `keyframes` values are plain object literals too, but Emotion
 * serialises any object with a string `styles` from that string alone, so a key
 * spread or merged in beside it is silently dropped. Arrays, strings and
 * functions are never maps.
 * @param value The `css` value to test.
 * @returns `true` when `value` can be combined key by key.
 */
export function isMergeableCss(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  if (proto !== null && proto !== Object.prototype) return false
  return typeof (value as { styles?: unknown }).styles !== 'string'
}
