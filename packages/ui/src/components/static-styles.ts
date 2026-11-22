import type { StaticThemeCandidate } from '@src/util/static-theme-check.util.js'
import type { ThemeVarIndex, ThemeVarRef } from '@src/util/theme-diagnostics.util.js'

export type { StaticThemeCandidate }

/**
 * The development checks of named styles' theme tokens, in the server build.
 * Its React has neither context nor effects, so this module loads neither; the
 * default build swaps in `static-styles.default.ts`, which checks.
 */

/** In the server build, which has no context to read: the walk checks nothing in render. */
export const checkThemeRefsInScope = (_refs: readonly ThemeVarRef[], _own: ThemeVarIndex | undefined): boolean => false

/** In the server build, which commits nothing: no check after commit. */
export const checkCandidatesAfterCommit = (_candidates: readonly StaticThemeCandidate[]): void => {}
