/**
 * Compile-time verification that css values keep their literal options as
 * members, which is what an editor offers as completions. A union that collapses
 * to plain `string` still accepts every value but offers none.
 * Run: bunx tsc --noEmit (included in project typecheck).
 */
import type { ThemedCSSObject, ThemedCSSProperties } from '@src/types/node.type'

/**
 * `true` when the literal `L` is a member of `T` itself. `Extract` keeps the
 * members assignable to `L`: the literal when it is there, never plain `string`.
 */
type Offers<T, L extends string> = [Extract<T, L>] extends [never] ? false : true

type CssValue<K extends keyof ThemedCSSObject> = ThemedCSSObject[K]
type PropValue<K extends keyof ThemedCSSProperties> = ThemedCSSProperties[K]

// --- css values: keyword properties and length properties ---
export const cssDisplay: Offers<CssValue<'display'>, 'flex'> = true
export const cssPosition: Offers<CssValue<'position'>, 'absolute'> = true
export const cssPadding: Offers<CssValue<'padding'>, 'inherit'> = true
export const cssWidth: Offers<CssValue<'width'>, 'auto'> = true

// --- direct style props ---
export const propDisplay: Offers<PropValue<'display'>, 'flex'> = true
export const propPadding: Offers<PropValue<'padding'>, 'inherit'> = true
export const propWidth: Offers<PropValue<'width'>, 'auto'> = true

// --- the probe itself can fail ---
// @ts-expect-error plain `string` offers no literal
export const plainString: Offers<string, 'flex'> = true
// @ts-expect-error a value that is not a member is not offered
export const notMember: Offers<CssValue<'display'>, 'sideways'> = true
