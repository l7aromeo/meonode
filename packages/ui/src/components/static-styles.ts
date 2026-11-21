import { createElement, Fragment, type ReactElement, use } from 'react'
import { ThemeContext } from '@src/components/theme-provider.client.js'
import { StaticInsertion, type StaticThemeCandidate } from '@src/components/static-insertion.client.js'
import { NodeUtil } from '@src/util/node.util.js'
import { IS_REACT_SERVER_LAYER } from '@src/util/react-layer.util.js'
import { STATIC_CSS_BUCKETS, staticBucketOf, staticHref, staticPrecedence, staticRuleOf, STATIC_CSS_PREFIX } from '@src/util/static-css.util.js'
import { reportThemeVarRefs, unionThemeVarIndexes, type ThemeVarIndex, type ThemeVarRef } from '@src/util/theme-diagnostics.util.js'

export type { StaticThemeCandidate }

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
 * Theme variables of extracted styles to check against the providers above
 * `StaticStyles`, with the tokens of providers between it and the node.
 */
export interface StaticThemeCheck {
  refs: readonly ThemeVarRef[]
  /** What providers inside the render, between `StaticStyles` and the node, define. */
  own?: ThemeVarIndex
}

/** The key of the `StaticInsertion` a render's `StaticStyles` holds in the browser and the server-rendering pass. */
const INSERTION_KEY = 'mn-static-insertion'

/**
 * The static css a render uses: React hoistable styles on the server, and in the
 * browser, insertion into the static sheets once the render commits, by the
 * client module `StaticInsertion`.
 *
 * Its classes come in Emotion's order for the side it renders on. On the server
 * they are the render's classes in the order its nodes began, parents first, as
 * Emotion's server render meets them. In the browser they are in the order its
 * nodes completed, deepest first, as Emotion's insertion effects run, and they go
 * in from the insertion effect of its `StaticInsertion`, which runs after those
 * of any render nested inside it. Across renders the order is where each
 * `StaticStyles` sits:
 * at the end of its render's topmost host, so a render nested inside another
 * emits before it on the server as well.
 *
 * The tree has the same shape on both sides, which keeps `useId` stable through
 * hydration, and a hoistable leaves nothing in place for hydration to match.
 *
 * In development it also checks the theme tokens its render's static classes
 * reference, as `StyledRenderer` checks a styled element's, without adding to the
 * tree. Those of nodes it shares a theme scope with, it checks while rendering,
 * on the server and in the browser, against the providers above it and those
 * inside the render between them. Those of nodes under any other component, which
 * may provide another theme, it checks in the browser once they are committed,
 * on each element, against the providers above that element.
 * @param props.classes The registered classes of the render's nodes, in the order they reach the page.
 * @param props.checks The theme variables to check while rendering, while diagnostics are on.
 * @param props.candidates The theme variables to check after commit, in a development build in the browser.
 */
export function StaticStyles({
  classes,
  checks,
  candidates,
}: {
  classes?: readonly string[]
  checks?: readonly StaticThemeCheck[]
  candidates?: readonly StaticThemeCandidate[]
}): ReactElement | null {
  // `use` may be called conditionally; `checks` is only passed while diagnostics are on.
  if (checks) {
    const context = use(ThemeContext)
    const outer = context ? context.definedVars() : null
    for (const { refs, own } of checks) reportThemeVarRefs(refs, own ? unionThemeVarIndexes(outer, own) : outer)
  }
  // The server layer's output is only ever hoisted, and its React has no effects:
  // there is nothing to insert, and its checks go to `ThemeTokenCheck` instead.
  const insertion = IS_REACT_SERVER_LAYER ? null : createElement(StaticInsertion, { key: INSERTION_KEY, classes, candidates })
  if (!NodeUtil.isServer) return createElement(Fragment, null, insertion, null)
  const children: ReactElement[] = [...SEEDS]
  for (const className of classes ?? []) {
    const element = elementOf(className)
    if (element) children.push(element)
  }
  return createElement(Fragment, null, insertion, children)
}

/** Test seam: forgets the built module elements. */
export const __resetStaticStyles = (): void => classElements.clear()
