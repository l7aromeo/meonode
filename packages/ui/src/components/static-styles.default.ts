import { use } from 'react'
import { ThemeContext, type ThemeContextState } from '@src/components/theme-provider.client.js'
import { providedWalkContexts } from '@src/util/walk-contexts.util.js'
import { withNamedDiagnostics } from '@src/util/named-diagnostics.util.js'
import type { CandidateSink } from '@src/util/named-development-diagnostics.util.js'

/**
 * The development checks of named styles' theme tokens, in the default build,
 * the one the server's rendering pass and the browser load. The server build
 * swaps in `static-styles.ts`, which checks nothing.
 */

/**
 * The nearest provider's context where a walk renders: on the server and in the
 * browser alike, from the contexts handed to a memoized subtree's walk, or read
 * in the component's render.
 * @returns The context; `null` with no provider above; `undefined` outside a component's render, where `use` cannot read it.
 */
export function readThemeScope(): ThemeContextState | null | undefined {
  const provided = providedWalkContexts()
  if (provided) return provided.theme
  try {
    return use(ThemeContext)
  } catch {
    return undefined
  }
}

/**
 * Checks a walk's named nodes left for after commit, once their elements are
 * committed, in the browser.
 * @param walk The walk's record.
 */
export function checkCandidatesAfterCommit(walk: CandidateSink): void {
  withNamedDiagnostics(d => d.checkCandidatesAfterCommit(walk, ThemeContext))
}
