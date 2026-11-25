import type { ThemeContextState } from '@src/components/theme-provider.client.js'
import type { CandidateSink } from '@src/util/named-development-diagnostics.util.js'

/**
 * The development checks of named styles' theme tokens, in the server build.
 * Its React has neither context nor effects, so this module loads neither; the
 * default build swaps in `static-styles.default.ts`, which checks.
 */

/** In the server build, which has no context to read: the walk checks nothing in render. */
export const readThemeScope = (): ThemeContextState | null | undefined => undefined

/** In the server build, which commits nothing: no check after commit. */
export const checkCandidatesAfterCommit = (_walk: CandidateSink): void => {}
