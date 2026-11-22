import type { ReactElement } from 'react'
import { staticHoistables, type StaticStylesProps, type StaticThemeCandidate } from '@src/components/static-hoistables.js'
import type { ThemeVarIndex, ThemeVarRef } from '@src/util/theme-diagnostics.util.js'

export type { StaticStylesProps, StaticThemeCandidate, StaticThemeCheck } from '@src/components/static-hoistables.js'
export { __resetStaticStyles } from '@src/components/static-hoistables.js'

/** In the server build, which has no context to read: the walk checks nothing in render. */
export const checkThemeRefsInScope = (_refs: readonly ThemeVarRef[], _own: ThemeVarIndex | undefined): boolean => false

/** In the server build, which commits nothing: no check after commit. */
export const checkCandidatesAfterCommit = (_candidates: readonly StaticThemeCandidate[]): void => {}

/**
 * The static css a render uses, in the server build: React hoistable styles,
 * which are all this layer can send. Its React has neither context nor effects,
 * so this module loads neither Emotion nor client hooks; the default build swaps
 * in `static-styles.default.ts`, which also inserts the classes in the browser.
 *
 * Its classes come in the order the render's nodes began, parents first, which
 * is Emotion's order. The browser takes over what this sends by `href`.
 * @param props.classes The registered classes of the render's nodes, in the order they reach the page.
 */
export function StaticStyles({ classes }: StaticStylesProps): ReactElement[] {
  return staticHoistables(classes)
}
