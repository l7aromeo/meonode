/**
 * What `useTheme()` hands back, for a site that has declared its modes.
 *
 * The provider's props and the script's config were narrowed first; the context
 * is the third surface and the one a consumer touches most — `setMode` is what
 * a toggle calls. Left loose it accepts any string, so a typo compiles and no
 * stylesheet matches, which is the failure the runtime cannot catch: a misspelt
 * mode is consistent with itself.
 *
 * Its own file rather than an addition to the script's, so a failure names which
 * surface regressed.
 *
 * Run: `bun run typecheck:augmented`, which the lint script chains.
 */
import { useTheme } from '@meonode/ui'

declare module '@meonode/ui' {
  interface MeoTheme {
    mode: 'morning' | 'night'
  }
}

type Api = ReturnType<typeof useTheme>

declare const api: Api

// --- What the site declared is accepted ---
export const toMorning = () => api.setMode('morning')
export const toNight = () => api.setMode('night')
export const follow = () => api.setPreference('system')
export const toDeclared = () => api.setPreference('night')

// --- The typo the user asked about ---
// @ts-expect-error `nigth` is not a mode this site declared
export const typo = () => api.setMode('nigth')

// @ts-expect-error nor is any other string
export const anything = () => api.setMode('anything-at-all')

// @ts-expect-error a preference is a declared mode or the word `system`
export const badPreference = () => api.setPreference('wat')

// --- What it reports is narrowed too, so a consumer can switch exhaustively ---
export const currentMode: 'morning' | 'night' = api.mode
// @ts-expect-error the light/dark names are not this site's
export const notOurs: 'light' | 'dark' = api.mode

// `modes` carries the declared set, not an open list of strings.
export const declaredModes: readonly ('morning' | 'night')[] | undefined = api.modes
