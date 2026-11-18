/**
 * Compile-time verification of fallback arrays in a `css` object: a known
 * property takes its value or a readonly array of its string values, as
 * Emotion's `CSSPropertiesWithMultiValues` does, with theme tokens as items.
 * Run: bunx tsc --noEmit (included in project typecheck).
 */
import { Div } from '@src/components/html.node'

declare const fallbacks: readonly string[]
const asConst = ['-webkit-box', 'flex'] as const

// --- Accepted ---
export const tokenItem = Div({ css: { padding: ['theme.spacing.md'] } })
export const lengthItems = Div({ css: { padding: ['1px', '2px'] } })
export const mixedItems = Div({ css: { padding: ['1px', 'theme.spacing.md'] } })
export const keywordItems = Div({ css: { display: ['-webkit-box', 'flex'] } })
export const readonlyItems = Div({ css: { display: asConst } })
export const readonlyStrings = Div({ css: { margin: fallbacks } })
export const nestedBlock = Div({ css: { '&:hover': { padding: ['1px', 'theme.spacing.md'] } } })
export const emptyList = Div({ css: { padding: [] } })
// The single value is unchanged.
export const singleNumber = Div({ css: { padding: 4 } })
export const singleToken = Div({ css: { padding: 'theme.spacing.md' } })
export const singleFunction = Div({ css: { padding: () => '1px' } })

// --- Rejected, as Emotion rejects them ---
// @ts-expect-error a fallback list holds strings, not numbers
export const numberItems = Div({ css: { padding: [1, 2] } })
// @ts-expect-error nor a number among strings
export const mixedNumberItem = Div({ css: { padding: ['1px', 2] } })
// @ts-expect-error nor a nested list
export const nestedList = Div({ css: { padding: [['1px']] } })
// @ts-expect-error nor a theme function
export const functionItem = Div({ css: { padding: [(): string => '1px'] } })
// @ts-expect-error a function returns one value, not a list
export const functionList = Div({ css: { padding: () => ['1px'] } })

// --- Still rejected, as before ---
// @ts-expect-error a colour is not a number
export const numberColor = Div({ css: { color: 4 } })
// @ts-expect-error nor a list of numbers
export const numberColorItems = Div({ css: { color: [4] } })
// @ts-expect-error a known property does not take a style object
export const objectValue = Div({ css: { display: { color: 'red' } } })
