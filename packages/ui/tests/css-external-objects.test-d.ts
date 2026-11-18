/**
 * Compile-time verification of style objects typed elsewhere passed as `css`:
 * React's `CSSProperties` and csstype's `Properties` are accepted as they are,
 * spread, and annotated; Emotion's `CSSObject` goes through `css()`.
 * Run: bunx tsc --noEmit (included in project typecheck).
 */
import type React from 'react'
import { css } from '@emotion/react'
import type { ComponentSelector, CSSObject } from '@emotion/serialize'
import type { Properties } from 'csstype'
import { Button, Div } from '@src/components/html.node'
import { Node } from '@src/core.node'
import type { CssProp } from '@src/types/node.type'

declare const reactStyle: React.CSSProperties
declare const csstypeStyle: Properties
declare const csstypeOpenStyle: Properties<(string & {}) | number>
declare const emotionObject: CSSObject
declare const selector: ComponentSelector
declare const date: Date

// --- React's CSSProperties ---
export const reactDirect = Div({ css: reactStyle })
export const reactSpread = Div({ css: { ...reactStyle } })
export const reactSpreadWithMore = Div({ css: { ...reactStyle, '&:hover': { color: 'red' } } })
export const reactAnnotated: CssProp = reactStyle

// --- csstype's Properties ---
export const csstypeDirect = Div({ css: csstypeStyle })
export const csstypeSpread = Div({ css: { ...csstypeStyle } })
export const csstypeAnnotated: CssProp = csstypeStyle
export const csstypeOpenDirect = Div({ css: csstypeOpenStyle })

// --- at polymorphic call sites ---
export const reactUnderAs = Div({ as: 'a', href: '#', css: reactStyle })
export const csstypeUnderAs = Button('go', { as: 'a', href: '#', css: csstypeStyle })
export const reactThroughNode = Node('div', { as: 'a', href: '#', css: reactStyle })

// --- Emotion's CSSObject goes through css() ---
export const emotionThroughCss = Div({ css: css(emotionObject) })
// Its properties allow what no fallback list here takes (`padding: [1, 2]`), so it
// is not accepted as it is; `css()` serializes it the way Emotion would.
// @ts-expect-error Emotion's CSSObject, passed as it is
export const emotionDirect = Div({ css: emotionObject })

// --- still rejected ---
// @ts-expect-error a number is not a style
export const numberThroughFactory = Div({ css: 4 })
// @ts-expect-error a component selector is not a style
export const selectorThroughFactory = Div({ css: selector })
// @ts-expect-error a component selector is not a style
export const selectorAnnotated: CssProp = selector
// @ts-expect-error an object with no style properties is not a style
export const dateAnnotated: CssProp = date

// Accepted though it holds no style. A factory call relates `css` to an
// intersection, where TypeScript skips the check that rejects it above, and a type
// literal such as `{ id: string }` was already accepted there. Rejecting objects
// with no style property would also reject a css literal holding only selectors.
export const dateThroughFactory = Div({ css: date })
