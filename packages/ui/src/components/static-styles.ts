import { createElement, Fragment, type ReactElement, use, useEffect, useInsertionEffect } from 'react'
import { __unsafe_useEmotionCache as useEmotionCache } from '@emotion/react'
import { isDevMode } from '@src/constant/common.const.js'
import { ThemeContext, type ThemeContextState } from '@src/components/theme-provider.client.js'
import { NodeUtil } from '@src/util/node.util.js'
import { IS_REACT_SERVER_LAYER } from '@src/util/react-layer.util.js'
import {
  type EmotionSheetPlacement,
  insertStaticClasses,
  STATIC_CSS_BUCKETS,
  staticBucketOf,
  staticHref,
  staticPrecedence,
  staticRuleOf,
  STATIC_CSS_PREFIX,
} from '@src/util/static-css.util.js'
import { mountedThemeVarIndex, reportThemeVarRefs, unionThemeVarIndexes, type ThemeVarIndex, type ThemeVarRef } from '@src/util/theme-diagnostics.util.js'

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

/**
 * Theme variables of extracted styles on elements under a component inside the
 * render, which may provide another theme, so they are checked on each element
 * after commit, against the providers above that element.
 */
export interface StaticThemeCandidate {
  /** The node's static classes: every element with all of them reads `refs`. */
  classes: string
  refs: readonly ThemeVarRef[]
  /** Those its `--mv-*` variables' values hold, read by the element that sets the variable. */
  valueRefs: readonly (readonly [valueVar: string, refs: readonly ThemeVarRef[]])[]
}

/** React's `$$typeof` of a context provider before React 19, where the provider was not the context itself. */
const REACT_PROVIDER_TYPE = Symbol.for('react.provider')

/** The prefix of the key under which React DOM keeps an element's fiber; a random suffix follows. */
const FIBER_KEY_PREFIX = '__reactFiber$'

/**
 * The nearest theme provider above a rendered element: the context the element
 * would read. Development only.
 *
 * It reads React's internals, as React's devtools do, and nothing else of them:
 * the element's `__reactFiber$…` key; on each fiber, `return`, its parent, and
 * `type`, which for a provider is the context itself, or before React 19 an
 * object of `$$typeof` `react.provider` whose `_context` is the context; and on
 * the provider's fiber, `memoizedProps.value`, the value it provides.
 * @param element A rendered element.
 * @returns The provider's state; `null` when none is above; `undefined` when any of those fields is missing.
 */
export function nearestThemeContext(element: Element): ThemeContextState | null | undefined {
  const key = Object.keys(element).find(name => name.startsWith(FIBER_KEY_PREFIX))
  if (key === undefined) return undefined
  let fiber: unknown = (element as unknown as Record<string, unknown>)[key]
  while (fiber !== null) {
    if (typeof fiber !== 'object' || fiber === undefined || !('return' in fiber) || !('type' in fiber)) return undefined
    const type = fiber.type as { $$typeof?: unknown; _context?: unknown } | null
    if (
      type === (ThemeContext as unknown) ||
      (typeof type === 'object' && type !== null && type.$$typeof === REACT_PROVIDER_TYPE && type._context === ThemeContext)
    ) {
      const props = 'memoizedProps' in fiber ? (fiber.memoizedProps as { value?: unknown } | null) : undefined
      return props && 'value' in props ? ((props.value as ThemeContextState | null) ?? null) : undefined
    }
    fiber = fiber.return
  }
  return null
}

/**
 * Checks each element that carries a candidate's classes against the providers
 * above it. An element without React's fiber to read is checked against every
 * mounted provider instead, once the commit's effects have run: a provider above
 * records its tokens in an effect that runs after this one.
 * @param candidates The render's candidates.
 */
export function checkCandidates(candidates: readonly StaticThemeCandidate[]): void {
  const unread: [Element, StaticThemeCandidate][] = []
  for (const candidate of candidates) {
    const names = candidate.classes.split(' ')
    for (const element of document.getElementsByClassName(names[0])) {
      if (!names.every(name => element.classList.contains(name))) continue
      const context = nearestThemeContext(element)
      if (context === undefined) unread.push([element, candidate])
      else checkElement(element, candidate, context ? context.definedVars() : null)
    }
  }
  if (unread.length > 0)
    queueMicrotask(() => {
      const defined = mountedThemeVarIndex()
      for (const [element, candidate] of unread) checkElement(element, candidate, defined)
    })
}

/**
 * Reports what of a candidate an element reads and `defined` lacks: the theme
 * variables of its classes, and those of the `--mv-*` variables it sets.
 * @param element An element with the candidate's classes.
 * @param candidate The candidate.
 * @param defined What the providers above the element define, or `null` when there are none.
 */
function checkElement(element: Element, { refs, valueRefs }: StaticThemeCandidate, defined: ThemeVarIndex | null): void {
  reportThemeVarRefs(refs, defined)
  const style = (element as HTMLElement).style
  for (const [valueVar, ownRefs] of valueRefs) if (style?.getPropertyValue(valueVar).includes('--meonode-theme-')) reportThemeVarRefs(ownRefs, defined)
}

/** What makes two renders' candidates the same, so they are checked again only when that changes. */
const candidatesKey = (candidates: readonly StaticThemeCandidate[] | undefined): string =>
  candidates ? candidates.map(({ classes, refs, valueRefs }) => `${classes}|${refs.join()}|${valueRefs.join()}`).join('\n') : ''

/**
 * The static css a render uses: React hoistable styles on the server, and in the
 * browser, insertion into the static sheets once the render commits.
 *
 * Its classes come in Emotion's order for the side it renders on. On the server
 * they are the render's classes in the order its nodes began, parents first, as
 * Emotion's server render meets them. In the browser they are in the order its
 * nodes completed, deepest first, as Emotion's insertion effects run, and they go
 * in from this component's insertion effect, which runs after those of any render
 * nested inside it. Across renders the order is where each `StaticStyles` sits:
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
  // The server layer's React has no context or effects, and its output is only ever
  // hoisted; a build of the layer folds this out.
  if (!IS_REACT_SERVER_LAYER) {
    // Where MeoNode's runtime rules go, so the static ones go right before them.
    const cache = useEmotionCache()
    // Before layout effects and paint, as Emotion inserts its own: in this
    // render's order, which is the order its nodes completed, deepest first.
    useInsertionEffect(() => {
      if (classes) insertStaticClasses(cache?.sheet as unknown as EmotionSheetPlacement | undefined, classes)
    }, [cache, classes])
  }
  // `use` may be called conditionally; `checks` is only passed while diagnostics are on.
  if (checks) {
    const context = use(ThemeContext)
    const outer = context ? context.definedVars() : null
    for (const { refs, own } of checks) reportThemeVarRefs(refs, own ? unionThemeVarIndexes(outer, own) : outer)
  }
  // A development build has the effect on every render and a production build never
  // does, so the hooks stay the same from one render to the next. The server layer's
  // React has no effects, and its checks go to `ThemeTokenCheck` instead.
  if (isDevMode() && !IS_REACT_SERVER_LAYER) {
    const key = candidatesKey(candidates)
    useEffect(() => {
      if (candidates) checkCandidates(candidates)
      // Keyed by content: an equal list from a later render is not checked again.
    }, [key])
  }
  if (!NodeUtil.isServer) return null
  const children: ReactElement[] = [...SEEDS]
  for (const className of classes ?? []) {
    const element = elementOf(className)
    if (element) children.push(element)
  }
  return createElement(Fragment, null, children)
}

/** Test seam: forgets the built module elements. */
export const __resetStaticStyles = (): void => classElements.clear()
