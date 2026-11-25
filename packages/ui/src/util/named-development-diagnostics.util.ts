import type { ThemeContextState } from '@src/components/theme-provider.client.js'
import { checkCandidatesAfterCommit as checkAfterCommit, type StaticThemeCandidate, type ThemeContextType } from '@src/util/static-theme-check.util.js'
import {
  collectNamedThemeVarRefs,
  definedVarsOf,
  reportThemeVarRefs,
  scopeVars,
  type ThemeScope,
  type ThemeVarIndex,
  unionThemeVarIndexes,
} from '@src/util/theme-diagnostics.util.js'

/**
 * The development diagnostics of named styles, the styles extraction compiles:
 * what `named-diagnostics.util.ts` imports in development and loads lazily in
 * production, through `lazy-named-diagnostics.util.ts`. A table of their own,
 * so a bundle without named styles leaves them out.
 */

/** The variables defined where an element renders, from the nearest provider's context, or `null` with none. */
const definedAt = (context: ThemeContextState | null): ThemeVarIndex | null => (context ? definedVarsOf(context) : null)

/**
 * Reports the theme variables a compiled style references that the providers
 * above its element do not define.
 * @param styles The style's serialized text.
 * @param context The nearest provider's context, or `null`.
 */
export function checkNamedStyles(styles: string, context: ThemeContextState | null): void {
  reportThemeVarRefs(collectNamedThemeVarRefs(styles), definedAt(context))
}

/** A walk's record of the named nodes to check after commit. */
export interface CandidateSink {
  candidates?: StaticThemeCandidate[]
}

/**
 * Checks a named node's theme variables: in the walk's own theme scope, against
 * the providers above its component and those the walk passed; under a
 * component the walk cannot see into, or outside any component's render, on the
 * element once it is committed, in the browser.
 * @param walk Where the node goes to be checked after commit.
 * @param classes The node's classes.
 * @param text Its style's text.
 * @param own The providers the walk passed on the way to the node.
 * @param opaqueAbove Whether a component the walk cannot see into is above it.
 * @param readScope Reads the nearest provider's context where the walk renders: `null` with none, `undefined` outside a render.
 * @param afterCommit Whether a node not checked here is checked after commit.
 */
export function checkNamedNode(
  walk: CandidateSink,
  classes: string,
  text: string,
  own: ThemeScope | undefined,
  opaqueAbove: boolean,
  readScope: () => ThemeContextState | null | undefined,
  afterCommit: boolean,
): void {
  const refs = collectNamedThemeVarRefs(text)
  if (refs.length === 0) return
  if (!opaqueAbove) {
    const context = readScope()
    if (context !== undefined) {
      const outer = definedAt(context)
      reportThemeVarRefs(refs, own ? unionThemeVarIndexes(outer, scopeVars(own)) : outer)
      return
    }
  }
  if (afterCommit) (walk.candidates ??= []).push({ classes, refs })
}

/**
 * Checks a walk's named nodes once their elements are committed.
 * @param walk The walk's record.
 * @param ThemeContext The context ThemeProvider provides.
 */
export function checkCandidatesAfterCommit(walk: CandidateSink, ThemeContext: ThemeContextType): void {
  if (walk.candidates !== undefined) checkAfterCommit(walk.candidates, ThemeContext)
}
