/**
 * The token map every themed layout provides. Concrete values, so a resolved
 * token is visible in computed style, plus one `var()` token whose palette
 * lives in the root layout's CSS, the way the provider's docs set a site up.
 */
export const tokens = {
  primary: { default: 'rgb(10, 20, 200)', content: 'rgb(250, 250, 250)' },
  accent: 'rgb(200, 10, 10)',
  surface: 'var(--palette-surface)',
  spacing: { sm: 4, md: 8, lg: '24px' },
  radius: { md: 6 },
  breakpoint: { compact: '600px', wide: '1000px', num: 800 },
  font: { body: 'Georgia' },
  layout: { prose: 300, gap: '12px' },
  z: { top: 10 },
  duration: { fast: '150ms' },
}

export const themeProps = { tokens, modes: ['light'] as const, defaultMode: 'light' as const }
