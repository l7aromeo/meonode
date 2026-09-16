/**
 * Compile-time verification that the script and the provider read one shape.
 *
 * The two halves are configured separately but have to agree: the script stamps
 * `data-theme` before the first paint and the provider seeds itself from that
 * attribute. A field that means one thing on one side and another on the other
 * produces a mode the provider rejects and rewrites after hydration — a flash,
 * with no error anywhere.
 *
 * Asserted at the type level because the failure is a shape mismatch and there
 * is nothing to run. One literal is declared to satisfy both, which is also how
 * an application is meant to configure them.
 *
 * Complements `theme-modes-props.test-d.ts`, which holds the two providers'
 * prop sets apart; this one holds the provider and the script together.
 */
import { themeScript, type ThemeScriptConfig } from '@src/main.js'
import { ThemeProvider, type ThemeProviderProps } from '@src/components/theme-provider.js'
import type { ThemeSystemModes } from '@src/types/node.type.js'

const TOKENS = { colors: { primary: 'var(--brand-primary)' } }

const shared = {
  modes: ['morning', 'night'],
  defaultMode: 'morning',
  system: { light: 'morning', dark: 'night' },
  storageKey: 'theme',
} as const

const forScript: ThemeScriptConfig = shared
const forProvider: Omit<ThemeProviderProps, 'tokens' | 'children'> = shared
const mapping: ThemeSystemModes = shared.system
const scriptTakesTheProvidersMapping: ThemeScriptConfig = { modes: shared.modes, defaultMode: shared.defaultMode, system: mapping }

// The call sites an application writes, from the one literal.
export const script = themeScript(shared)
export const provider = ThemeProvider({ ...shared, tokens: TOKENS, children: 'x' })

void forScript
void forProvider
void scriptTakesTheProvidersMapping
