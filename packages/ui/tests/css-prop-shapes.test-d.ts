/**
 * Compile-time verification of which shapes the top-level `css` prop accepts.
 * Run: bunx tsc --noEmit (included in project typecheck).
 */
import { css, keyframes } from '@emotion/react'
import type { ComponentSelector } from '@emotion/serialize'
import type { Theme } from '@src/types/node.type'
import { Div } from '@src/components/html.node'

const fadeIn = keyframes`from { opacity: 0; } to { opacity: 1; }`
declare const active: boolean
declare const selector: ComponentSelector

// --- Accepted ---
export const objectCss = Div({ css: { margin: 4 } })
export const arrayCss = Div({ css: [{ margin: 4 }, [{ padding: 2 }], css({ color: 'red' })] })
export const serializedCss = Div({ css: css({ margin: 4 }) })
export const stringCss = Div({ css: 'margin: 4px;' })
export const functionCss = Div({ css: (theme: Theme) => ({ color: theme.system.primary }) })
export const conditionalCss = Div({ css: active && { margin: 4 } })
export const nullCss = Div({ css: null })
export const undefinedCss = Div({ css: undefined })
// A keyframes value as the whole css is not a style either, but Emotion types it as
// `{…} & string`, so it cannot be told apart from a string css and still compiles.
export const keyframesCss = Div({ css: fadeIn })
// Still valid inside a style: keyframes as a value, numbers as lengths, and in arrays.
export const keyframesValueCss = Div({ css: { animationName: fadeIn, margin: 4 } })
export const keyframesInArrayCss = Div({ css: [{ margin: 4 }, { animation: `${fadeIn} 1s` }] })

// --- Rejected at the top level: they never rendered anything meaningful ---
// @ts-expect-error a number is not a style
export const numberCss = Div({ css: 4 })
// @ts-expect-error a component selector is not a style
export const selectorCss = Div({ css: selector })
