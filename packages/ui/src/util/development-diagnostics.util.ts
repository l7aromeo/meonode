import type { ThemeContextState } from '@src/components/theme-provider.client.js'
import type { Theme } from '@src/types/node.type.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'
import {
  collectNamedThemeVarRefs,
  collectThemeVarRefs,
  definedVarsOf,
  getThemeVarIndex,
  getTokensVarIndex,
  reportThemeIssues,
  reportThemeVarRefs,
  trackProviderVars,
  type ThemeVarIndex,
  type ThemeVarRef,
} from '@src/util/theme-diagnostics.util.js'

/**
 * The development diagnostics of the table every app loads: what
 * `diagnostics.util.ts` imports in development and loads lazily in production,
 * through `lazy-diagnostics.util.ts`. The named styles of extraction have a
 * table of their own, `named-development-diagnostics.util.ts`. Each export is a
 * check a caller hands what it reads; none returns anything a render uses but
 * {@link themeVarRefsOf}, which a caller reads only once this module is loaded.
 */

export { checkCss, checkFactoryCss, checkThemeFunctionResult, markCombinedCssChecked } from '@src/util/css-check.util.js'
export { checkFactoryArguments } from '@src/util/factory-check.util.js'
export { noteGeneratedList, observeChildren } from '@src/util/generated-list.util.js'
export {
  reportDroppedThemeFunction,
  reportSharedStyleName,
  reportUncomposedClass,
  reportUnresolvedThemeKey,
  definedVarsOf,
} from '@src/util/theme-diagnostics.util.js'

/** The variables defined where an element renders, from the nearest provider's context, or `null` with none. */
const definedAt = (context: ThemeContextState | null): ThemeVarIndex | null => (context ? definedVarsOf(context) : null)

/**
 * Reports the theme tokens in an element's resolved css that will not produce a
 * style, against the providers above it.
 *
 * With no provider above, a token is left as `theme.…` text rather than turned
 * into the variable the server emits for it, so it is turned into one here, for
 * the check alone, and reported as having no provider.
 * @param css The resolved css.
 * @param context The nearest provider's context, or `null`.
 */
export function checkStyledCss(css: unknown, context: ThemeContextState | null): void {
  if (context) reportThemeIssues(css, definedVarsOf(context))
  else reportThemeIssues(replaceThemeTokensWithCssVars(css), null)
}

/**
 * Reports the theme tokens of css a server render resolved, against the theme
 * in scope. With none in scope, their references are checked where the
 * providers are, by `ThemeTokenCheck`.
 * @param css The resolved css.
 * @param theme The theme in scope.
 */
export function checkServerCss(css: unknown, theme: Theme | undefined): void {
  reportThemeIssues(css, theme ? getThemeVarIndex(theme) : undefined)
}

/**
 * Reports the theme variables a compiled style references that the theme in
 * scope does not define.
 * @param styles The style's serialized text.
 * @param theme The theme in scope.
 */
export function checkNamedStylesForTheme(styles: string, theme: Theme): void {
  reportThemeVarRefs(collectNamedThemeVarRefs(styles), getThemeVarIndex(theme))
}

/**
 * The theme variables css or a compiled style's text references.
 * @param source The css, or the text.
 * @returns The references.
 */
export const themeVarRefsOf = (source: unknown): ThemeVarRef[] => (typeof source === 'string' ? collectNamedThemeVarRefs(source) : collectThemeVarRefs(source))

/**
 * Reports the referenced theme variables the providers above an element do not
 * define, as `ThemeTokenCheck` receives them: the references, or what they are
 * read from.
 * @param refs The references.
 * @param source What they are read from, when `refs` is not given.
 * @param context The nearest provider's context, or `null`.
 */
export function checkThemeVarRefs(refs: readonly ThemeVarRef[] | undefined, source: unknown, context: ThemeContextState | null): void {
  reportThemeVarRefs(refs ?? themeVarRefsOf(source), definedAt(context))
}

/**
 * Builds what a nested provider defines, which reports each token it gives
 * another value than a provider above.
 * @param context The provider's context.
 */
export function checkNestedProvider(context: ThemeContextState): void {
  definedVarsOf(context)
}

/**
 * Records a mounted provider's tokens until the returned cleanup runs.
 * @param owner Identifies the provider.
 * @param tokens The provider's tokens.
 * @returns Removes the record.
 */
export const trackProviderTokens = (owner: object, tokens: unknown): (() => void) => trackProviderVars(owner, getTokensVarIndex(tokens))

/** What the checks made while the diagnostics loaded threw, by message, each reported once. */
const failedChecks = new Set<string>()

/**
 * Reports a check made while the diagnostics loaded that threw once they did,
 * too late to stop the render it was made in. A render stops at its first
 * throw, while the held checks all run, so two that throw the same error for
 * one value are reported once.
 * @param error What it threw.
 */
export function reportFailedCheck(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  if (failedChecks.has(message)) return
  failedChecks.add(message)
  console.error('[MeoNode] A check made before the diagnostics loaded failed.', error)
}

/**
 * Reports the checks made, while the diagnostics loaded, past what is held
 * meanwhile.
 * @param count How many.
 */
export function reportDroppedChecks(count: number): void {
  console.warn(`[MeoNode] Debug mode: ${count} checks made while its diagnostics loaded were dropped, so some problems may go unreported.`)
}
