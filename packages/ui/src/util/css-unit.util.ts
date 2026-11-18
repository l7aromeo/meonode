import unitless from '@emotion/unitless'
import { LengthPropertySet } from '@src/constant/css-properties.const.js'
import { declarationPropertyAt, toStyleKey } from '@src/util/theme-key.util.js'

/**
 * Shared rules for whether a CSS property needs a unit, and for the paired
 * "length" form of a theme variable.
 *
 * Both rewriters and the `:root` builder consult this, so they cannot disagree
 * about which declarations get the length treatment. A disagreement would emit
 * a reference to a variable that was never defined, which the browser drops
 * silently — the exact class of bug this exists to prevent.
 */

/**
 * Whether Emotion would append `px` to a raw number written against this
 * property.
 *
 * Mirrors `@emotion/serialize`'s `processStyleValue`:
 *
 * ```js
 * unitless[key] !== 1 && !isCustomProperty(key) && typeof value === 'number' && value !== 0
 * ```
 *
 * The value test lives at the call sites, since they hold different things (a
 * literal here, a token's resolved value there).
 * @param property The CSS property name.
 * @returns `true` when a bare number is not a valid value for this property.
 */
export const wouldEmotionAddPx = (property: string): boolean => (unitless as Record<string, number | undefined>)[property] !== 1 && !property.startsWith('--')

/**
 * Whether a token used for this property should reference the length variant.
 * @param property The CSS property name, in any form Emotion writes as that
 * property: `paddingTop`, `padding-top`, `-webkit-margin-start`.
 * @returns `true` for properties whose value is a length.
 */
export const isLengthProperty = (property: string): boolean => LengthPropertySet.has(toStyleKey(property))

/**
 * Whether a raw theme value needs a unit appended before it can serve as a
 * length. Only bare numbers do: `0` is valid unitless, and a string is taken as
 * authored.
 * @param value The raw value from the theme.
 * @returns `true` when the paired length variable should be emitted.
 */
export const needsLengthVariant = (value: unknown): value is number | string => {
  if (typeof value === 'number') return value !== 0
  // A theme value is data, not authored CSS, so `'16'` is treated exactly like
  // `16`. Both would otherwise reach a length property as a bare number.
  if (typeof value !== 'string' || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return false
  return Number(value) !== 0
}

/**
 * The paired variable that carries the same token with `px` appended.
 *
 * Emitted only for numeric token values, and referenced only from length
 * properties as `var(--x--len, var(--x))`. The fallback is what makes this work
 * without knowing the token's type at the usage site: when no length variant
 * exists — a colour, a string that already has a unit — the reference falls
 * through to the plain variable and behaves exactly as before.
 * @param varName The plain variable name.
 * @returns The length-variant variable name.
 */
export const toLengthVarName = (varName: string): string => `${varName}--len`

/**
 * A reference that prefers the length variant and falls back to the plain one.
 * @param varName The plain variable name.
 * @returns The `var()` expression to emit.
 */
export const lengthVarRef = (varName: string): string => `var(${toLengthVarName(varName)}, var(${varName}))`

/**
 * Marks a string as CSS text standing alone, such as a `css` string or a string
 * in a `css` array. It has no key to name a property; each of its declarations
 * names its own.
 */
export const CSS_TEXT: unique symbol = Symbol('meonode.cssText')

/**
 * What a string holding theme tokens was written against: the property key it is
 * the value of, `undefined` when that key names no property (a selector or an
 * at-rule), or {@link CSS_TEXT}.
 */
export type TokenContext = string | undefined | typeof CSS_TEXT

/**
 * The reference that replaces a theme token: the length form when the property
 * the token is written against takes a length, the plain variable otherwise.
 *
 * Both rewriters — the server's, which may have no theme, and the client's —
 * choose through this, from the property alone and never from the token's
 * value, so the two compile the same class.
 * @param varName The token's plain variable name.
 * @param context What the string holding the token was written against.
 * @param text The string holding the token.
 * @param index Where the token starts in `text`.
 * @returns The `var()` expression to emit.
 */
export const themeVarRef = (varName: string, context: TokenContext, text: string, index: number): string => {
  const property = context === CSS_TEXT ? declarationPropertyAt(text, index) : context
  return property !== undefined && isLengthProperty(property) ? lengthVarRef(varName) : `var(${varName})`
}

/**
 * Whether an object key is a nested selector or at-rule rather than a CSS
 * property. Such a key contributes no property of its own, so the enclosing
 * property stays in scope for anything inside it.
 * @param key The object key.
 * @returns `true` for selectors (`&:hover`) and at-rules (`@media …`).
 */
export const isSelectorOrAtRule = (key: string): boolean => key.startsWith('&') || key.startsWith('@')

/**
 * Whether `value` under `key` is a fallback list of a length property: an array
 * Emotion writes as one declaration of that property per item, so each item is a
 * value of the property and a token in it needs the length form.
 *
 * Every other array is walked as CSS text and style objects, as a `css` array
 * is. That reads a fallback list of any other property the same way, since a
 * bare token there takes the plain variable either way, and it keeps a wrapper
 * key such as `css` in `{ css: [flatCssProps, css] }` from being taken for a
 * property its CSS text would then be written against.
 * @param key The object key.
 * @param value The value under it.
 * @returns `true` when the items are values of the length property `key` names.
 */
export const isLengthFallbackList = (key: string, value: unknown): value is unknown[] => Array.isArray(value) && isLengthProperty(key)
