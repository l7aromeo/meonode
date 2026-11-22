import { type ReactElement, use, useEffect, useInsertionEffect } from 'react'
import { __unsafe_useEmotionCache as useEmotionCache } from '@emotion/react'
import { isDevMode } from '@src/constant/common.const.js'
import { ThemeContext, type ThemeContextState } from '@src/components/theme-provider.client.js'
import { staticHoistables, type StaticStylesProps } from '@src/components/static-hoistables.js'
import { NodeUtil } from '@src/util/node.util.js'
import { type EmotionSheetPlacement, insertStaticClasses } from '@src/util/static-css.util.js'
import { candidatesKey, checkCandidates } from '@src/util/static-theme-check.util.js'
import { providedWalkContexts } from '@src/util/walk-contexts.util.js'
import { reportThemeVarRefs, type ThemeVarIndex, type ThemeVarRef, unionThemeVarIndexes } from '@src/util/theme-diagnostics.util.js'

export type { StaticStylesProps, StaticThemeCandidate, StaticThemeCheck } from '@src/components/static-hoistables.js'
export { __resetStaticStyles } from '@src/components/static-hoistables.js'
export { checkCandidatesAfterCommit } from '@src/util/static-theme-check.util.js'

/**
 * Checks, in development, theme variables a node in the walk's own theme scope
 * reads, against the providers above the component the walk renders in and
 * `own`, those of the providers the walk passed on the way to the node: what a
 * `StaticStyles` at its topmost host would check, with nothing added to the render.
 * On the server and in the browser alike.
 * @param refs The variables.
 * @param own The providers' between, if any.
 * @returns `false` outside a component's render, where `use` cannot read them.
 */
export function checkThemeRefsInScope(refs: readonly ThemeVarRef[], own: ThemeVarIndex | undefined): boolean {
  let context: ThemeContextState | null
  const provided = providedWalkContexts()
  if (provided) context = provided.theme
  else
    try {
      context = use(ThemeContext)
    } catch {
      return false
    }
  const outer = context ? context.definedVars() : null
  reportThemeVarRefs(refs, own ? unionThemeVarIndexes(outer, own) : outer)
  return true
}

/**
 * The static css a render uses, in the default build, the one the server's
 * rendering pass and the browser load: React hoistable styles on the server, and
 * in the browser, insertion into the static sheets once the render commits. One
 * fiber either way, at the same place, which keeps `useId` stable through
 * hydration; a hoistable leaves nothing in place for hydration to match. The
 * server build swaps in `static-styles.ts`, which only hoists.
 *
 * Its classes come in the order the render's nodes began, parents first, which
 * is Emotion's order on both sides: Emotion inserts each element's rule from a
 * leaf rendered just before the element, so ahead of its subtree. On the server
 * they are hoisted in that order; in the browser they go in from this
 * component's insertion effect. Across renders the order is where each
 * `StaticStyles` sits, at the end of its render's topmost host: a render nested
 * inside another goes in before it, on both sides, where Emotion would insert
 * the outer render's nodes that began before the nested one first. The buckets
 * keep that from deciding a tie between a rule for another element and that
 * element's own rules; it decides one only between two rules of one bucket.
 *
 * In development it also checks the theme tokens its render's static classes
 * reference, as `StyledRenderer` checks a styled element's. Those of nodes it
 * shares a theme scope with, it checks while rendering, on the server and in the
 * browser, against the providers above it and those inside the render between
 * them. Those of nodes under any other component, which may provide another
 * theme, it checks in the browser once they are committed, on each element,
 * against the providers above that element.
 * @param props.classes The registered classes of the render's nodes, in the order they reach the page.
 * @param props.checks The theme variables to check while rendering, while diagnostics are on.
 * @param props.candidates The theme variables to check after commit, in a development build in the browser.
 */
export function StaticStyles({ classes, checks, candidates }: StaticStylesProps): ReactElement[] | null {
  // `use` may be called conditionally; `checks` is only passed while diagnostics are on.
  if (checks) {
    const context = use(ThemeContext)
    const outer = context ? context.definedVars() : null
    for (const { refs, own } of checks) reportThemeVarRefs(refs, own ? unionThemeVarIndexes(outer, own) : outer)
  }
  // Where MeoNode's runtime rules go, so the static ones go right before them.
  const cache = useEmotionCache()
  // Before layout effects and paint, as Emotion inserts its own, in the order
  // the render's nodes began. The server runs no effects.
  useInsertionEffect(() => {
    if (classes) insertStaticClasses(cache?.sheet as unknown as EmotionSheetPlacement | undefined, classes)
  }, [cache, classes])
  // A development build has the effect on every render and a production build
  // never does, so the hooks stay the same from one render to the next.
  if (isDevMode()) {
    const key = candidatesKey(candidates)
    useEffect(() => {
      if (candidates) checkCandidates(candidates)
      // Keyed by content: an equal list from a later render is not checked again.
    }, [key])
  }
  if (!NodeUtil.isServer) return null
  return classes ? staticHoistables(classes) : []
}
