// Regression fixture: cache-path-spread
//
// The same call site, invoked twice with DIFFERENT spread contents. `Div`'s
// third argument is `deps` — every `@meonode/ui` factory (`Node`,
// `createNode`-derived factories, including plain HTML factories) accepts one.
//
// `@meonode/ui@1.x` held each memoized element in a global map keyed by a
// string derived from the node's props. `k` is a pure function of call-site
// *source position*, identical across both invocations, and a spread's
// contents are not nameable at compile time, so a marker carrying `k` made
// both invocations derive the SAME key — and the second was served the
// first's element. The plugin's answer was to withhold `k` (and `dyn`)
// whenever a spread is present, so the runtime fell back to hashing the
// spread-contributed props by value.
//
// `2.0.0-beta.0` removed that map: memoized subtrees live in fibers and
// `deps` is handed straight to `useMemo`, so nothing is derived and nothing
// can collide. The plugin still withholds `k` here, because a compiled bundle
// has to stay correct on `1.x` as well.
//
// It also made `deps` mean literally what React means by it, which the two
// exports below pin from either side.
import { Div } from '@meonode/ui'

/**
 * Empty `deps` — "never rebuild". Under `useMemo` semantics the second
 * invocation keeps the first element, spread contents notwithstanding. `1.x`
 * rebuilt it anyway, because a changed prop changed the derived cache key.
 */
export function makeRow(extra: Record<string, unknown>) {
  return Div({ ...extra, padding: '4px' }, [])
}

/**
 * `deps` that actually track the spread's contents, which is what a caller
 * wanting the row to follow `id` has to write. Rebuilds on every change.
 */
export function makeTrackedRow(extra: Record<string, unknown>) {
  return Div({ ...extra, padding: '4px' }, [extra.id])
}
