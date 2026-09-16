/**
 * The mode API, for a site that has declared its modes.
 *
 * `ResolvedThemeMode` is `MeoTheme['mode']` when a site augments it and the
 * loose `ThemeMode` when it does not, so narrowing costs an un-augmented site
 * nothing and is invisible to the rest of the suite — which is exactly why it
 * needs a project of its own. A `declare module` is global to the compilation:
 * put this augmentation in `tests/` and it would narrow `ResolvedThemeMode` for
 * every other type test in the same run.
 *
 * Run: `bun run typecheck:augmented`, which the lint script chains.
 *
 * The `@ts-expect-error` lines are the assertions. If one of these ever starts
 * compiling, the directive goes unused and the build fails — that is what makes
 * them a control rather than a comment.
 */
import { themeScript } from '@meonode/ui'

declare module '@meonode/ui' {
  interface MeoTheme {
    mode: 'morning' | 'night'
  }
}

export const declared = themeScript({
  modes: ['morning', 'night'],
  defaultMode: 'morning',
  defaultPreference: 'system',
  system: { light: 'morning', dark: 'night' },
})

// The typo the user asked about. Runtime validation cannot catch it: a misspelt
// mode is consistent with itself, so `defaultMode` is a member of `modes` and
// every check passes while no stylesheet matches.
// @ts-expect-error `nigth` is not a mode this site declared
export const typoInModes = themeScript({ modes: ['morning', 'nigth'], defaultMode: 'morning' })

// @ts-expect-error the terminal fallback has to name a declared mode
export const undeclaredDefault = themeScript({ modes: ['morning', 'night'], defaultMode: 'evening' })

// @ts-expect-error a starting preference is a declared mode or the word `system`
export const undeclaredPreference = themeScript({ modes: ['morning', 'night'], defaultMode: 'morning', defaultPreference: 'dusk' })

// On one line on purpose: `@ts-expect-error` suppresses the line that follows
// it, and the error here is on the `system` property several lines into a
// formatted call — so spread out, the directive goes unused and the assertion
// silently stops asserting.
// @ts-expect-error both sides of the mapping name declared modes
export const undeclaredMapping = themeScript({ modes: ['morning', 'night'], defaultMode: 'morning', system: { light: 'morning', dark: 'midnight' } })
