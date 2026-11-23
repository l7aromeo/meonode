import { use } from 'react'
import { ThemeContext, type ThemeContextState } from '@src/components/theme-provider.client.js'
import { providedWalkContexts } from '@src/util/walk-contexts.util.js'
import { reportThemeVarRefs, type ThemeVarIndex, type ThemeVarRef, unionThemeVarIndexes } from '@src/util/theme-diagnostics.util.js'

export type { StaticThemeCandidate } from '@src/util/static-theme-check.util.js'
export { checkCandidatesAfterCommit } from '@src/util/static-theme-check.util.js'

/**
 * The development checks of named styles' theme tokens, in the default build,
 * the one the server's rendering pass and the browser load. The server build
 * swaps in `static-styles.ts`, which checks nothing.
 */

/**
 * Checks, in development, theme variables a node in the walk's own theme scope
 * reads, against the providers above the component the walk renders in and
 * `own`, those of the providers the walk passed on the way to the node, with
 * nothing added to the render. On the server and in the browser alike.
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
