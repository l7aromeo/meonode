/**
 * Compile-time verification that the two providers keep their prop sets apart.
 * Run: bunx tsc --noEmit (included in project lint).
 *
 * This is why the mode path is a second component rather than a second shape on
 * the first one. `createNode` infers a component's props, and a union of the two
 * shapes collapses to `never` there — every existing `ThemeProvider({ theme })`
 * call site stops compiling. Two components keep each set required where it
 * belongs, so a half-configured provider is a compile error instead of a throw
 * at render.
 *
 * The `@ts-expect-error` lines are the assertions: if a misconfiguration ever
 * starts compiling, the directive goes unused and fails the build.
 */
import { ThemeModesProvider, ThemeProvider } from '@src/components/theme-provider.js'
import type { Theme } from '@src/types/node.type.js'

const TOKENS = { colors: { primary: 'var(--brand-primary)' } }
const THEME: Theme = { mode: 'light', system: TOKENS }

// --- The mode path, fully configured ---
export const modes = ThemeModesProvider({ tokens: TOKENS, modes: ['morning', 'night'], defaultMode: 'morning', children: 'x' })
export const withSystem = ThemeModesProvider({
  tokens: TOKENS,
  modes: ['morning', 'night'],
  defaultMode: 'morning',
  system: { light: 'morning', dark: 'night' },
  storageKey: 'ui-mode',
  children: 'x',
})

// --- Half-configured, which is the case that used to throw at render ---
// @ts-expect-error tokens without modes
export const noModes = ThemeModesProvider({ tokens: TOKENS, defaultMode: 'morning', children: 'x' })
// @ts-expect-error tokens without defaultMode
export const noDefault = ThemeModesProvider({ tokens: TOKENS, modes: ['morning'], children: 'x' })
// @ts-expect-error a theme is not a token map
export const themeOnMode = ThemeModesProvider({ theme: THEME, children: 'x' })

// --- The original path, unchanged ---
export const legacy = ThemeProvider({ theme: THEME, children: 'x' })
export const legacyAs = ThemeProvider({ theme: THEME, children: 'x', as: 'section' })
export const legacyDeps = ThemeProvider({ theme: THEME, children: 'x' }, [1])
// @ts-expect-error and it still refuses the mode shape
export const modesOnLegacy = ThemeProvider({ tokens: TOKENS, modes: ['morning'], defaultMode: 'morning', children: 'x' })
