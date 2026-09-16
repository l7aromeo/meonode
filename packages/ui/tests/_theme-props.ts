import type { Theme } from '@src/main.js'

/**
 * The provider's props for a suite that only cares about token resolution.
 *
 * v3 takes a token map plus the mode names a site declares, where 2.x took a
 * theme object. These suites predate that and test something else — variable
 * emission, prop classification, hydration — so they declare the one mode their
 * fixture theme names and hand over its tokens.
 */
export const asThemeProps = (theme: Theme) => ({
  tokens: theme.system,
  modes: [theme.mode],
  defaultMode: theme.mode,
})
