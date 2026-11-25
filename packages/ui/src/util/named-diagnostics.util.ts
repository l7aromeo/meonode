import { registerDiagnostics } from '@src/util/diagnostics.util.js'
import * as development from '@src/util/named-development-diagnostics.util.js'

/**
 * The table of named styles' diagnostics, registered with
 * `diagnostics.util.ts` when a module that renders named styles loads, so a
 * bundle without them carries neither this stub nor its diagnostics.
 */

/** The development diagnostics of named styles, as their checks receive them. */
export type NamedDiagnostics = typeof development

/**
 * The diagnostics this module loads with it, outside production, shaped as
 * `developmentDiagnostics` in `diagnostics.util.ts` is, for the same bundlers.
 * @returns The diagnostics, outside production.
 */
export function namedDevelopmentDiagnostics(): NamedDiagnostics | undefined {
  if (process.env.NODE_ENV !== 'production') return development
  return undefined
}

let initial: NamedDiagnostics | undefined
// With no `process` and nothing substituted, the read throws: production.
try {
  initial = namedDevelopmentDiagnostics()
} catch {
  // Production.
}

const table = registerDiagnostics(initial, () => import('@src/util/lazy-named-diagnostics.util.js'))

/** Runs a check of named styles now if their diagnostics are loaded, or, while diagnostics are on, once they are. */
export const withNamedDiagnostics = table.withDiagnostics

/** The diagnostics of named styles, if loaded: always outside production. */
export const loadedNamedDiagnostics = table.loadedDiagnostics
