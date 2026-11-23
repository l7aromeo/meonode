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

/**
 * Written as the bare `process.env.NODE_ENV` because that is the expression
 * bundlers substitute with a string literal — Vite in dev (pre-bundled or not)
 * and in its builds, webpack and Turbopack — so in a browser bundle it never
 * reaches `process` and folds to a constant in production. Vite leaves a
 * `typeof process` guard alone, and a browser has no `process`, so a guard in
 * front of the read would turn development off under `vite dev`.
 *
 * Where nothing substitutes it and no `process` exists — a bundle that defines
 * nothing, or the ESM build loaded straight from an import map — the read throws
 * a ReferenceError, and that counts as production.
 */
function readDevMode(): boolean {
  try {
    return process.env.NODE_ENV !== 'production'
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

/**
 * The precedence of the runtime rules React hoists into the head: those of
 * server components, and the ones a client renders through React's hoistable
 * styles.
 */
export const RUNTIME_PRECEDENCE = 'meonode'

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
 * Marker key holding the name of a call site's whole style, which the compiler
 * serialized at build time: the name `StyledRenderer` would give the same css,
 * so the element's class is `${cache.key}-${name}`, the one it would have with
 * extraction off. Its text reaches the page through {@link registerStaticCss},
 * inserted where Emotion would insert it.
 */
export const STATIC_NAME_MARKER = '__meo$n'

/**
 * Marker key of a named node the compiler chose to carry the named styles that
 * begin after it, up to the next cut or the end of its render: it renders
 * through `StyledRenderer`, as a runtime node does, so its insertion puts them
 * in after its own, with no element added to the children. The compiler marks
 * every call site that may begin a stretch in any render, so the node renders
 * through `StyledRenderer` in every render, and React keeps it. In a render
 * where a rule comes before it, it carries nothing: its rule goes in with that
 * rule's run, and it renders only its host (see {@link STATIC_CLASS_ONLY_PROP}).
 */
export const STATIC_CARRIER_MARKER = '__meo$r'

/**
 * Marker key holding a call site's template and its values: the id of a
 * template registered by `registerStaticTemplate`, then each hole's value as
 * `toCssValue` writes it. Filled in, it is the call site's whole style, named
 * as the runtime names any serialized styles, so the node is a named one.
 */
export const STATIC_TEMPLATE_MARKER = '__meo$t'

/**
 * The prop a node built from a template keeps its whole style's text on: it is
 * its own, so no registry holds the text of every value it is rendered with.
 */
export const STATIC_TEXT_PROP = '__meonodeStaticText'

/**
 * The prop of a `StyledRenderer` holding the run of named styles of its render
 * that began after the previous rule: it inserts them ahead of its own rule.
 */
export const STATIC_RUN_PROP = '__meonodeStaticRun'

/**
 * The prop of a `StyledRenderer` holding, in `run`, the named styles of its
 * render that began after it and that no later rule takes: it inserts them after
 * its own. Filled in once the walk has passed them, after the element is built.
 */
export const STATIC_RUN_AFTER_PROP = '__meonodeStaticRunAfter'

/**
 * The prop of a `StyledRenderer` holding its scope on a server render with no
 * cache provider: the outermost styled element above it, whose cache Emotion
 * would share with it, so its rule goes out once in that scope.
 */
export const STATIC_SCOPE_PROP = '__meonodeStaticScope'

/**
 * The prop of a `StyledRenderer` for a carrier that follows a rule in this
 * render: it keeps the carrier's type, so React keeps the element, and renders
 * the host with the class the walk composed. Its rule goes in with the run of
 * the rule before it, as an unmarked node's would, so it has no leaf.
 */
export const STATIC_CLASS_ONLY_PROP = '__meonodeStaticClassOnly'

/**
 * The prop of a `StyledRenderer` that a server component hands a compiled
 * node's style, `{ name, styles }`, in place of `css`: the module that registered
 * it never loads in the browser, so the text goes with the element.
 */
export const STATIC_STYLE_PROP = '__meonodeStaticStyle'

/**
 * Marker key of a layout factory's call site whose initial props the compiler
 * merged itself: a fingerprint of what it merged (see `initialPropsFingerprint`).
 * When it is the factory's own, the factory uses the call site's props as given.
 */
export const INITIAL_PROPS_MARKER = '__meo$i'

/**
 * Per-schema names of the compiled marker's contract keys. Indexed by the schema
 * version found in {@link COMPILED_MARKER}.
 */
export const COMPILER_SCHEMA_KEYS: Readonly<
  Record<
    number,
    {
      css: string
      dom: string
      key: string
      dyn: string
      list?: string
      loc?: string
      name?: string
      template?: string
    }
  >
> = {
  // Schema 1 gets no `list` entry, and must not: its bucket names are unprefixed,
  // so a spread carrying a real prop of the same name would collide with it, the
  // same hazard that retired `d` (a valid SVG `<path>` attribute). A schema 1 call
  // site therefore never reports a missing key — it predates the contract.
  1: { css: 'c', dom: 'd', key: 'k', dyn: 'dyn' },
  2: {
    css: '__meo$c',
    dom: '__meo$d',
    key: '__meo$k',
    dyn: '__meo$dyn',
    list: LIST_MARKER,
    loc: LOCATION_MARKER,
    name: STATIC_NAME_MARKER,
    template: STATIC_TEMPLATE_MARKER,
  },
  // Schema 3 reuses schema 2's names. `css`/`dom`/`dyn` are never present on a
  // schema 3 call site, but naming them keeps the marker-stripping loop in
  // `_processCompiledProps` uniform across schemas.
  3: {
    css: '__meo$c',
    dom: '__meo$d',
    key: '__meo$k',
    dyn: '__meo$dyn',
    list: LIST_MARKER,
    loc: LOCATION_MARKER,
    name: STATIC_NAME_MARKER,
    template: STATIC_TEMPLATE_MARKER,
  },
}
