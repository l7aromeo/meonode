import { wouldEmotionAddPx } from '@src/util/css-unit.util.js'
import { replaceThemeTokensInString } from '@src/util/server-theme.util.js'

/**
 * A css value as the runtime would write it for `property`, for a CSS variable
 * that an extracted rule reads.
 *
 * Compiled output sets these on the element's `style` in place of the css entry
 * the runtime would otherwise have compiled, so the value has to be the text
 * Emotion would have written: a non-zero number gets `px` unless Emotion's
 * unitless table names the property as written, and `theme.*` tokens become the
 * same `var(...)` references the runtime emits.
 * @param property The css property exactly as authored, `lineHeight` or `line-height`.
 * @param value The runtime value.
 * @returns The value's text, or `undefined` where Emotion writes no value: for
 * `null`, `undefined`, booleans, `''` and anything that is not a string or number.
 */
export function toCssValue(property: string, value: unknown): string | undefined {
  if (typeof value === 'number') return value !== 0 && wouldEmotionAddPx(property) ? `${value}px` : String(value)
  if (typeof value === 'string' && value !== '') return replaceThemeTokensInString(value, property)
  return undefined
}
