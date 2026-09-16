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
import { ThemeProvider } from '@src/components/theme-provider.js'
import type { Theme } from '@src/types/node.type.js'

const TOKENS = { colors: { primary: 'var(--brand-primary)' } }
const THEME: Theme = { mode: 'light', system: TOKENS }

// --- The mode path, fully configured ---
export const modes = ThemeProvider({ tokens: TOKENS, modes: ['morning', 'night'], defaultMode: 'morning', children: 'x' })
export const withSystem = ThemeProvider({
  tokens: TOKENS,
  modes: ['morning', 'night'],
  defaultMode: 'morning',
  system: { light: 'morning', dark: 'night' },
  storageKey: 'ui-mode',
  children: 'x',
})

// --- The field a site configures both halves with, which must be assignable
//     here as well: `createNode` narrows an unknown prop to `never`, so a
//     literal that feeds the script's config and the provider's props cannot be
//     shared until both declare it.
export const withDefaultPreference = ThemeProvider({
  tokens: TOKENS,
  modes: ['morning', 'night'],
  defaultMode: 'morning',
  defaultPreference: 'system',
  system: { light: 'morning', dark: 'night' },
  children: 'x',
})
export const sharedConfig = ThemeProvider({
  ...({ tokens: TOKENS, modes: ['morning', 'night'], defaultMode: 'morning', defaultPreference: 'night', storageKey: 'theme' } as const),
  children: 'x',
})

// --- Half-configured, which is the case that used to throw at render ---
// @ts-expect-error tokens without modes
export const noModes = ThemeProvider({ tokens: TOKENS, defaultMode: 'morning', children: 'x' })
// @ts-expect-error tokens without defaultMode
export const noDefault = ThemeProvider({ tokens: TOKENS, modes: ['morning'], children: 'x' })
// A 2.x call shape no longer type-checks at all: `theme` is not a prop and the
// three required ones are absent. Written as two directives rather than one,
// because the errors land on different parts of the call.
// @ts-expect-error `theme` is not a prop of this provider
export const themeShape = ThemeProvider({ theme: THEME, children: 'x' })

// --- What the node factory still supports on the one provider ---
export const withAs = ThemeProvider({ tokens: TOKENS, modes: ['morning', 'night'], defaultMode: 'morning', children: 'x', as: 'section' })
export const withDeps = ThemeProvider({ tokens: TOKENS, modes: ['morning', 'night'], defaultMode: 'morning', children: 'x' }, [1])
