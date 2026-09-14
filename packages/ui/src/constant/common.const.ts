export const NO_STYLE_TAGS = [
  'html',
  'head',
  'meta',
  'link',
  'script',
  'style',
  'noscript',
  'template',
  'slot',
  'base',
  'param',
  'source',
  'track',
  'wbr',
  'embed',
  'object',
  'iframe',
  'frame',
  'frameset',
  'applet',
  'bgsound',
  'noembed',
  'noframes',
] as const

export const noStyleTagsSet = new Set(NO_STYLE_TAGS)
export type NO_STYLE_TAGS = typeof NO_STYLE_TAGS

export let __DEBUG__ = false

/**
 * Whether this process is running outside production, captured once.
 *
 * `process.env.NODE_ENV` is a native `getenv` on every access in Node, not a
 * property read — bundlers inline it for the browser, and SSR pays it in full.
 * Read per call it costs about 112ns; read once it costs about 3.8ns, and
 * `reportThemeIssues` consults it at every recursion level of every styled node
 * on every render.
 *
 * A `let` rather than a `const` only so {@link refreshDevMode} can re-read it;
 * nothing else should assign to it.
 */
let __DEV_MODE__ = readDevMode()

function readDevMode(): boolean {
  try {
    return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
  } catch {
    return false
  }
}

/**
 * Re-reads `NODE_ENV` after a test has changed it.
 *
 * A value captured at module load cannot see `vi.stubEnv`, so the seam exists
 * for tests that stub the environment and expect the change to take. It is
 * called from `__resetThemeDiagnostics`, which those tests already invoke right
 * after stubbing — so they need no change and there is no second thing to
 * remember.
 */
export const refreshDevMode = (): void => {
  __DEV_MODE__ = readDevMode()
}

/** Read by {@link diagnosticsEnabled}; exported so the live binding is visible there. */
export const isDevMode = (): boolean => __DEV_MODE__

export function setDebugMode(enabled: boolean) {
  __DEBUG__ = enabled
  if (__DEBUG__) {
    console.log('[MeoNode] Debug mode enabled.')
  }
}

/**
 * Marker key used by the build-time SWC compiler to identify pre-partitioned
 * props objects (e.g. `{ __meo$: 2, __meo$c: {...}, __meo$d: {...} }`) produced
 * for a call site.
 */
export const COMPILED_MARKER = '__meo$'

/**
 * Schema versions of the compiled marker contract that this runtime knows how
 * to consume. Compiled output with an unsupported schema version is ignored.
 *
 * - **1** — buckets named `c`/`d`/`k`/`dyn`. Emitted by `@meonode/compiler@0.1.x`.
 *   Retained for compatibility; unsafe to combine with object spreads, since a
 *   spread can carry a real prop named `d` (a valid SVG `<path>` attribute) that
 *   collides with the bucket key.
 * - **2** — buckets namespaced under the marker prefix, so no user prop can
 *   collide. Emitted by `@meonode/compiler@0.2.0+`.
 * - **3** — *call-site key only*, no `c`/`d` buckets. Emitted for call sites the
 *   plugin cannot partition, where prop names are not statically knowable but
 *   the source position still is.
 *
 * The call-site key `k` and its companion `dyn` are accepted and stripped, but
 * no longer read. They existed to key a global element cache, which derived an
 * identity for each memoized node and needed help telling two structurally
 * identical ones apart. Memoized subtrees now live in fibers of their own, so
 * identity comes from React and nothing has to be derived — which leaves schema
 * 3 emitting a key this runtime has no use for.
 */
export const SUPPORTED_COMPILER_SCHEMAS: ReadonlySet<number> = new Set([1, 2, 3])

/**
 * Marker key set by the compiler on a call site whose `children` expression was
 * generated rather than written out — a `.map()`, a spread, an IIFE, a helper
 * call. Present with the value `1`, absent otherwise.
 *
 * Whether children were authored or generated cannot be recovered at runtime:
 * arguments are evaluated before the callee runs, so `items.map(fn)` has already
 * collapsed into an ordinary array by the time the node function is entered, and
 * that array is indistinguishable from one a human typed out. Only the source
 * answers the question, so the compiler answers it and the runtime reads the
 * answer.
 *
 * Read in three places, not one, and changing any of them changes the feature:
 * `NodeUtil.processProps` carries it onto `FinalNodeProps` on both its compiled
 * and legacy branches; `NodeUtil._processChildren` takes it as `keepArray` and
 * stops collapsing a one-element array, which is the whole reason a `.map()`
 * over a single row is reported at all; and `BaseNode.render` decides the
 * argument shape handed to `createElement`. A reader who changes the collapse in
 * `_processChildren` reopens that hole without ever opening `BaseNode.render`.
 */
export const LIST_MARKER = '__meo$list'

/**
 * Marker key carrying the source position — `file:line:column` — of a call site
 * whose `children` expression was generated. Emitted only when the plugin is
 * configured with `callSiteLocations`, so it is absent from most builds.
 *
 * It exists because React cannot answer "where". `Div({...})` only builds a
 * node; `createElement` fires later inside `.render()`, so React attributes
 * every element in the tree to that one call and its report points at the
 * top-level render for a list written anywhere in the file. Read only by
 * `BaseNode.render`, and only behind `setDebugMode`, which prints it beside
 * React's report rather than in place of it.
 */
export const LOCATION_MARKER = '__meo$loc'

/**
 * Per-schema names of the compiled marker's contract keys. Indexed by the schema
 * version found in {@link COMPILED_MARKER}.
 */
export const COMPILER_SCHEMA_KEYS: Readonly<Record<number, { css: string; dom: string; key: string; dyn: string; list?: string; loc?: string }>> = {
  // Schema 1 gets no `list` entry, and must not: its bucket names are unprefixed,
  // so a spread carrying a real prop of the same name would collide with it, the
  // same hazard that retired `d` (a valid SVG `<path>` attribute). A schema 1 call
  // site therefore never reports a missing key — it predates the contract.
  1: { css: 'c', dom: 'd', key: 'k', dyn: 'dyn' },
  2: { css: '__meo$c', dom: '__meo$d', key: '__meo$k', dyn: '__meo$dyn', list: LIST_MARKER, loc: LOCATION_MARKER },
  // Schema 3 reuses schema 2's names. `css`/`dom`/`dyn` are never present on a
  // schema 3 call site, but naming them keeps the marker-stripping loop in
  // `_processCompiledProps` uniform across schemas.
  3: { css: '__meo$c', dom: '__meo$d', key: '__meo$k', dyn: '__meo$dyn', list: LIST_MARKER, loc: LOCATION_MARKER },
}
