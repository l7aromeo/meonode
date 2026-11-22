import { createElement, type ReactElement } from 'react'
import { STATIC_CSS_BUCKETS, staticBucketOf, staticHref, staticPrecedence, staticRuleOf, STATIC_CSS_PREFIX } from '@src/util/static-css.util.js'
import type { StaticThemeCandidate } from '@src/util/static-theme-check.util.js'
import type { NamedStyle } from '@src/util/named-style.util.js'
import type { ThemeVarIndex, ThemeVarRef } from '@src/util/theme-diagnostics.util.js'

export type { StaticThemeCandidate }

/**
 * Theme variables of extracted styles to check against the providers above
 * `StaticStyles`, with the tokens of providers between it and the node.
 */
export interface StaticThemeCheck {
  refs: readonly ThemeVarRef[]
  /** What providers inside the render, between `StaticStyles` and the node, define. */
  own?: ThemeVarIndex
}

/**
 * What a render hands its `StaticStyles`, the same in both builds.
 * @property classes The registered classes of the render's nodes, in the order they reach the page.
 * @property checks The theme variables to check while rendering, while diagnostics are on; never in the server layer.
 * @property candidates The theme variables to check after commit, in a development build in the browser.
 * @property styles The named styles of the render's nodes that no runtime node of it inserted, in the order they began; never in the server layer.
 */
export interface StaticStylesProps {
  classes?: readonly string[]
  styles?: readonly NamedStyle[]
  checks?: readonly StaticThemeCheck[]
  candidates?: readonly StaticThemeCandidate[]
}

/**
 * One empty hoistable style per bucket. React orders precedences by the first
 * style it meets in each, so every render that emits static css meets these
 * first, and the buckets reach the head in bucket order whichever a page uses.
 */
const SEEDS: readonly ReactElement[] = Array.from({ length: STATIC_CSS_BUCKETS }, (_, bucket) =>
  createElement('style', { key: `${STATIC_CSS_PREFIX}${bucket}`, href: `${STATIC_CSS_PREFIX}${bucket}`, precedence: staticPrecedence(bucket) }, ''),
)

/** Each class's hoistable style, built once: classes are bounded by the code. */
const classElements = new Map<string, ReactElement | null>()

function elementOf(className: string): ReactElement | null {
  let element = classElements.get(className)
  if (element !== undefined) return element
  const cssText = staticRuleOf(className)
  const bucket = staticBucketOf(className)
  const href = staticHref(className)
  element = cssText === undefined || bucket === undefined ? null : createElement('style', { key: href, href, precedence: staticPrecedence(bucket) }, cssText)
  classElements.set(className, element)
  return element
}

/**
 * The hoistable styles a server render sends for a render's classes: the seeds,
 * then each class's style, in the order given. React dedupes them by `href`
 * within a request and hoists them into the head.
 * @param classes The render's classes.
 */
export function staticHoistables(classes: readonly string[] | undefined): ReactElement[] {
  const children: ReactElement[] = [...SEEDS]
  for (const className of classes ?? []) {
    const element = elementOf(className)
    if (element) children.push(element)
  }
  return children
}

/** Test seam: forgets the built module elements. */
export const __resetStaticStyles = (): void => classElements.clear()
