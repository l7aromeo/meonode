/** Two modes, starting on the one that is not first, so a probe reading it shows the provider was found. */
export const THEME = {
  tokens: { base: { default: 'var(--base-default)' } },
  modes: ['light', 'dark'],
  defaultMode: 'dark',
} as const
