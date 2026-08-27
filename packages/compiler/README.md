# @meonode/compiler

**[Documentation](https://ui.meonode.com/docs/getting-started/compiler)** · [MeoNode UI docs](https://ui.meonode.com)

**Experimental.** An SWC WASM plugin (Rust, compiled to `wasm32-wasip1`) that
rewrites `@meonode/ui` component call sites at build time so the
`@meonode/ui` runtime can skip its own per-render work.

## What it does, and why

Every `@meonode/ui` factory call (`Div({...})`, `P('text', {...})`,
`Node('div', {...})`, ...) normally does two things at runtime, on every
render: classify each prop as a static CSS prop vs. a dynamic/DOM prop, and
hash the prop signature to key the generated class name. Both are pure
functions of the call site's *source text* — they don't depend on runtime
values, only on which prop names appear and whether the object literal was
written with static shape. This plugin does that classification once, at
build time, and writes the answer directly into the call site as
pre-partitioned marker props:

```js
// Source:
Div({ padding: 'theme.spacing.md', width, onClick: handler, css: { color: 'red' }, children: [A, B] })

// Compiled:
Div({
  __meo$: 2,
  __meo$c: { padding: 'var(--meonode-theme-spacing-md)', width },
  __meo$d: { onClick: handler },
  __meo$k: 'm1a2b3c',
  __meo$dyn: ['width', 'onClick'],
  css: { color: 'red' },
  children: [A, B],
})
```

`@meonode/ui`'s runtime fast path (**requires `@meonode/ui@1.7.0` or later**,
which understands the schema 2 marker contract) detects the `__meo$` marker and
uses the namespaced buckets directly instead of re-deriving them, skipping the
classification pass entirely. **`2.0.0-beta` or later is recommended** — it
removed the derived-key machinery outright, which fixed a class of memoization
collision the plugin could only narrow (see [measured effect](#measured-effect)).

Note the `padding` value above: alongside partitioning, the plugin also resolves
`theme.*` token strings to `var(--meonode-theme-*)` at build time. `@meonode/ui`
performs this identical conversion at runtime on every render — its `WeakMap`
memo only helps objects defined *outside* a render body, so every inline call
site re-walks its props each time — so this changes *when* the conversion
happens, never what it produces. Only prop **values** are rewritten; tokens in
object keys (`'@media (max-width: theme.breakpoint.md)'`) are left alone, since
CSS variables are invalid in media features and selector text.

### Measured effect

| Benchmark | Result |
| --- | --- |
| Node construction in isolation (`@meonode/ui`'s `bench/`) | **~1.7x faster** |
| Client render — mount plus re-renders (`@meonode/ui`'s `bench/`) | **~1.06x faster** |
| End-to-end SSR, 156-node tree, production React/Emotion (`e2e/bench-theme-tokens.mjs`) | *not re-measured since 2.0.0-beta* |

Both figures are much smaller than they were, and that is not a regression in
the plugin. Against `@meonode/ui@1.x` they read ~4x and ~1.6x, but most of what
they measured was the stable-key hashing the runtime no longer does at all:
uncompiled construction got ~2.4x faster in `2.0.0-beta`, so there is far less
left for compiling to remove. What remains is prop classification and the
theme-token rewrite.

The construction figure excludes React, Emotion and the DOM; it is the ceiling
on what compiling can remove, not what a page render improves by. The client
figure is measured separately because it is where the difference used to live —
`_getStableKey` returned early on the server, so the old `__meo$k` did nothing
during SSR — and it is now close to noise.

The end-to-end SSR figure predates `2.0.0-beta` and has not been re-run; treat
it as unverified rather than current.

Ratios move with machine load, and not evenly: the compiled path is shorter, so
fixed overhead and GC cost it proportionally more. Reproduce with
`bun run bench` in the `@meonode/ui` repo.

The end-to-end number depends on which `@meonode/ui` you run, because 1.7.1 and
1.7.2 each made the runtime cheaper *specifically for the shape compiled output
has*. Each widened the gap rather than closing it:

```text
against @meonode/ui 1.7.0
  partitioning only:              1.4305 -> 1.3124 ms/render    8.3% faster
  partitioning + theme rewrite:   1.5426 -> 1.3084 ms/render   15.2% faster

against @meonode/ui 1.7.4
  partitioning only:              1.0038 -> 0.8271 ms/render   17.6% faster
  partitioning + theme rewrite:   1.1894 -> 0.8446 ms/render   29.0% faster
```

The compiled timings are ~0.83 ms in both modes — compiled props are token-free
either way — while the *uncompiled* timings differ by ~0.19 ms. That gap is the
props walk only uncompiled call sites still pay, and the theme rewrite is what
moves a call site off it.

Token density matters — the benchmark uses the `@meonode/ui` docs site's real
density of ~0.8 token strings per compiled call site, and an earlier run at 7
tokens per node overstated the gain by roughly 2x.

Call sites the plugin can't safely prove are order-independent are left
completely untouched (see [What gets compiled](#what-gets-compiled-vs-bailed)
below) — they keep working exactly as before, through the runtime's normal
classification path. The plugin is safe to add or remove at any time.

It is a build-time speedup with no behavioural exception, as of
`@meonode/ui@2.0.0-beta`.

Before that release, a memoized node's rendered element was held in a global
map keyed by a string derived from its props and its position, and two nodes
deriving the same string shared one entry — the second rendering the first's
content. `__meo$k` is a hash of the call site's *source position*, so compiling
separated call sites that the derived key could not. It never closed the hole:
two instances of the *same* component share a source position, so `__meo$k` was
identical for both and they still collided.

`@meonode/ui@2.0.0-beta` moved memoized subtrees into fibers of their own.
Identity comes from React, nothing is derived, and nothing can collide — for
plain functions and `Component` alike. `__meo$k` and `__meo$dyn` are still
emitted and still accepted, but the runtime no longer reads them.

That is what moves the figures under [Measured effect](#measured-effect): most
of what compiling bought was the signature hashing it let the runtime skip.

## Install & configure

The plugin ships as a single `.wasm` file published under `@meonode/compiler`
(`main` points directly at the `.wasm`, no JS shim — see
[npm packaging](#npm-packaging)). It needs a host that can load an SWC WASM
plugin: Next.js (Turbopack or webpack) or Vite (via
`@vitejs/plugin-react-swc`).

### Next.js

```js
// next.config.js / next.config.mjs
export default {
  experimental: {
    // The package NAME, never an absolute path — Turbopack crashes on
    // absolute plugin paths.
    swcPlugins: [['@meonode/compiler', {}]],
  },
}
```

Verified against **Next 16.2.11**:

- **Turbopack** (`next build`, `next dev`) — the default bundler as of
  Next 16, and the primary target for this config shape.
- **webpack** (`next build --webpack`) — same `experimental.swcPlugins`
  config works unchanged; Next's webpack build path loads SWC plugins
  through the same `next-swc` binary as Turbopack does.

### Vite

Requires [`@vitejs/plugin-react-swc`](https://www.npmjs.com/package/@vitejs/plugin-react-swc)
(verified at `4.3.2`) — Vite's default `@vitejs/plugin-react` uses Babel, not
SWC, and can't load SWC plugins at all.

```js
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [
    react({
      plugins: [['@meonode/compiler', {}]],
    }),
  ],
})
```

### If the plugin doesn't load

Bailing is always safe — see [Version compatibility](#version-compatibility)
below for the SWC WASM ABI caveat if the plugin fails to load under a given
host/`@swc/core` combination. Everything still runs correctly through
`@meonode/ui`'s normal runtime classification path; you just don't get the
build-time speedup.

## What gets compiled vs. bailed

The plugin only rewrites a call site when it can *prove* the rewrite is
evaluation-order-safe. Proof requires binding resolution (so a shadowed or
re-exported local named e.g. `Div` isn't mistaken for the real import) and a
structural check of the props object literal.

Rewriting reorders evaluation — `c`-bucket props before `d`-bucket props,
special keys moved to the tail, any leading `...spread` left in place at the
front — so a call only compiles when that reorder can't be observed. As of
v0.2, the rule is no longer "every prop value must be side-effect-free": most
values (literals, identifiers, arrow/function expressions, nested
literal-only objects/arrays) can't observe or cause side effects and are
freely repartitioned, but *effectful* values (calls, member access, `await`,
`new`, assignments, conditionals, tagged templates, ...) must keep their
relative order against every other effectful value. In practice this means:
a call site with **zero or one** effectful prop value always compiles (the
dominant real-world shape — `key: item.id` in a `.map()`, a single dynamic
`backgroundColor`); a call site with two or more effectful values compiles
only if compiling wouldn't reorder them relative to each other.

| Condition | Compiles? | Notes |
|---|---|---|
| Plain object literal, all values literals/idents/arrows/nested literals | Yes | The common case |
| At most one effectful prop value anywhere in the object | Yes | Trivially order-preserving — covers `key: item.id`, a single dynamic style, etc. |
| Two+ effectful values whose relative order survives bucketing | Yes | E.g. `{ padding: g(), onClick: f() }` — both land in emit order matching source order |
| Leading spread(s) (`{ ...props, padding: '8px' }`) | Yes | Spread stays top-level; only *static-literal* props are bucketed, `k`/`dyn` omitted — see below |
| Non-identifier string key (`{ 'data-parallax': 1 }`) | Yes | Buckets normally, emitted with its original quoted key |
| Callee is a shadowed/redeclared local, not the real `@meonode/ui` import | No (bail) | `ShadowedOrUnbound` |
| Callee via namespace import (`import * as M from '@meonode/ui'; M.Div(...)`) | No (bail) | `NamespaceImport` |
| No args, or nothing at the expected props argument position | No (bail) | `MissingPropsArg` |
| Props argument isn't a plain object literal (identifier, call, ternary, member expr, spread arg) | No (bail) | `NotObjectLiteral` |
| A spread appears *after* a static prop (`{ padding: 1, ...rest }`) | No (bail) | `TrailingSpread` — the spread would need to win, which the merge order can't express |
| Object literal contains a spread argument *before* the props position (e.g. `P(...stuff, {...})`) | No (bail) | `SpreadBeforeProps` — runtime arg count isn't statically known |
| Computed key (`{ [k]: v }`) | No (bail) | `ComputedKey` |
| Numeric/bigint literal key | No (bail) | `NumericKey` |
| Getter/setter accessor property | No (bail) | `GetterSetterProp` |
| Shorthand method (`{ onClick() {} }`) | No (bail) | `MethodProp` |
| Two+ effectful values that would be reordered by compiling | No (bail) | `EffectfulReorder` — e.g. `{ onClick: f(), padding: g() }`, since `c` always emits before `d` |
| Object literal already has a `__meo$` key | No (bail) | `ExistingMarker` — already compiled |

Special keys (`css`, `props`, `ref`, `key`, `children`, `as`, `theme`,
`disableEmotion`) always stay at the top level of the emitted object — they're
moved to the tail in their original relative order, but never bucketed into
`c`/`d`. Their values are passed through as written, with one exception: the
theme tokens inside a `css` object literal are rewritten in place (see below),
which changes the CSS text the runtime receives but not where or when the prop
is evaluated. `key` and `children` in particular keep
`@meonode/ui`'s runtime semantics byte-identical: compiling never changes
how either is evaluated relative to the rest of the call.

### Theme token rewriting

String-literal values have their `theme.*` tokens rewritten to
`var(--meonode-theme-*)` — in the `__meo$c`/`__meo$d` buckets, and inside a
`css:` object literal, recursively. Object **keys** are never rewritten:

| Case | Rewritten? | Why |
|---|---|---|
| `padding: 'theme.spacing.md'` | Yes | Direct bucketed value |
| `border: '1px solid theme.base.deep'` | Yes | Rewritten in place, rest of the value preserved |
| `'data-token': 'theme.primary'` | Yes | The runtime converts tokens in DOM props too |
| `css: { color: 'theme.primary' }` | Yes | Values inside `css` are rewritten, the block itself stays a special key |
| `css: { '&:hover': { padding: 'theme.spacing.sm' } }` | Yes | The property comes from the nearest enclosing key, so `padding` still selects the length form |
| `'@media (max-width: theme.breakpoint.md)': {...}` | **No** | It's a *key*; `var()` is invalid in media features, so the runtime must resolve it concretely |
| `css: { transition: ['theme.motion.fast'] } ` | **No** | See "arrays" below |
| `theme: {...}` | **No** | Special key. Rewriting inside a theme *definition* would corrupt it |
| `` padding: `theme.spacing.${size}` `` | **No** | Not a static string literal |

Whether a token takes the paired `--len` form is decided by the CSS property it
is written against, and inside `css` that property is the nearest enclosing key
— with selectors and at-rules (`&:hover`, `@media …`) contributing none, since
they name no property. This mirrors `@meonode/ui`'s own
`isSelectorOrAtRule(key) ? undefined : key` rule, applied in both of its
conversion paths.

Two nested shapes are deliberately skipped:

- **Arrays.** `@meonode/ui` converts string items inside arrays on the server
  (`replaceThemeTokensWithCssVars`) but not on the client
  (`resolveObjWithTheme` substitutes only nested containers), so a token inside
  an array already behaves differently on the two sides. Compiling would have to
  pick one and bake it in.
- **A `theme.*` token in a non-selector key.** The runtime resolves such a key
  and then uses the *resolved* text as the property name, which decides the
  length question. With no theme at build time that name is unknowable, so the
  whole entry is left alone.

Two runtime quirks are reproduced deliberately, because diverging would make
compiled and uncompiled call sites disagree:

- The scan has no word boundary, so `'mytheme.primary'` really does become
  `'myvar(--meonode-theme-primary)'`.
- A token naming nothing under `theme.system` still becomes a `var()`
  reference. `'theme.mode'` compiles to `var(--meonode-theme-mode)`, which no
  `:root` rule defines — exactly as the runtime already leaves it.

### Spread-bearing call sites: prop partitioning, but not call-site keying

A leading spread's contents aren't known until runtime, so a spread-
bearing call site gets **prop partitioning but not call-site keying**: the
`__meo$` marker, the spread itself, and `__meo$c`/`__meo$d` buckets for whatever's
statically known are all still emitted (the classification speedup is fully
retained for those), but **`k` and `dyn` are never emitted at all** when a
spread is present.

Why: `k` is a pure function of call-site *source position* — it's identical
across every evaluation of the same call site regardless of what the spread
happens to contain that time. If `k` were still emitted, two evaluations of
`Div({ ...props, padding: '8px' })` with *different* `props` contents would
produce an *identical* `k` (and `dyn` can't help, since a spread's contents
aren't nameable at compile time). If that node also carried a `deps` array, `@meonode/ui@1.x` keyed its cached
element by a signature derived from `k` — so a *stale* element, built from an
earlier evaluation's props, could be returned for a later one with genuinely
different spread contents. A missing `k` made the runtime recompute the
signature from the props instead, which is why omitting it was the safe choice.

`@meonode/ui@2.0.0-beta` reads neither `k` nor `dyn`, so that hazard is gone and
this rule and the one below are no longer load-bearing for correctness. They are
kept for two reasons. A compiled bundle must stay correct on `1.x` — and,
measured, leaving these props flat is also the *faster* shape: bucketing them
builds two extra objects for the runtime to merge, which costs more than the
classification it saves once a spread carries more than a few props. On a
12-prop spread, bucketing everything measured 0.92-0.94x against leaving it
flat; on a 4-prop spread the two were indistinguishable.

That `1.x` fallback hashed most top-level prop values directly (primitives
inline, functions via a cached `toString` hash, etc.), but any *other*
object-valued top-level prop only by its key names, not by its nested
values. That's fine for the spread's own contents (they land as ordinary
flat top-level props, so they're hashed by value like anything else) but
would be a problem for a prop that got bucketed into `c`/`d` as usual: its
actual value would become invisible to the legacy fallback, one level
deeper behind the bucket's own structural hash — quietly reintroducing the
exact same staleness hazard for an ordinary dynamic prop instead of a
spread. So whenever a spread is present, a non-special prop is only
bucketed into `c`/`d` when its value is a **static literal** (a value that
can never differ between evaluations of the same call site, so hiding it
behind a structural hash loses no information); anything else — including
prop values that would otherwise have simply been listed in `dyn` — stays
flat at the top level instead, exactly where it would sit in genuinely
uncompiled code:

```js
// Source:
Div({ ...props, onClick: handler, padding: '8px' })

// Compiled: `padding` (static) buckets into `__meo$c`; `onClick` (dynamic)
// stays flat, right alongside the spread. No `__meo$k`, no `__meo$dyn`.
Div({
  __meo$: 2,
  ...props,
  onClick: handler,
  __meo$c: { padding: '8px' },
})
```

### `factoryModules` — recognizing wrapped factories

Packages that wrap `Node()` in their own factory helper (e.g. `@meonode/mui`'s
`createMuiNode`) are invisible to per-file detection, since detection only
traces `@meonode/ui` imports and same-file `createNode`/
`createChildrenFirstNode` bindings. Opt a wrapping package in via the plugin
config:

```js
// Next.js
experimental: {
  swcPlugins: [['@meonode/compiler', { factoryModules: ['@meonode/mui'] }]],
}

// Vite
react({ plugins: [['@meonode/compiler', { factoryModules: ['@meonode/mui'] }]] })
```

Every capitalized named import from a listed module (e.g. `Button`,
`TextField`) is treated as a props-at-arg-0 factory, same as a plain
`@meonode/ui` HTML factory. Lowercase named imports (helper functions, e.g.
`createMuiNode`, `isProbablyMuiTheme`) are always ignored. Namespace imports
from a listed module still bail (`NamespaceImport`), same as `@meonode/ui`'s.
Only list modules whose capitalized exports are *all* props-at-arg-0 factories.
The plugin cannot verify that a capitalized export really is a meonode factory
— it has no cross-module resolution — so a capitalized export that merely takes
an object as its first argument (a plain function component called directly, a
config helper, a `Provider`-style wrapper) **will** have its argument rewritten
into marker props. Children-first factories in a listed module are likewise
unsafe: bindings from `factoryModules` are always treated as props-at-arg-0.
Capitalized *default* imports are ignored entirely.

A non-object-literal
first argument is never touched. A missing or malformed `factoryModules`
config is equivalent to omitting it — no extra modules are recognized, and
the build never fails because of it.

## Marker contract

Compiled call sites get a `schema 1` marker object, recognized by the
`__meo$` key:

| Key | Meaning |
|---|---|
| `__meo$` | Marker schema version (currently always `1`). |
| `c` | Bucket of props recognized as CSS/static props (omitted if empty). |
| `d` | Bucket of props recognized as dynamic/DOM props (omitted if empty). |
| `k` | Deterministic call-site key (`m` + base36 FNV-1a64 hash of `filename:span`), used by the runtime to key the generated class name without re-hashing the prop signature. |
| `dyn` | Names of bucketed props (from `c` or `d`) whose value isn't a plain literal — i.e. props the runtime still needs to treat as reactive/dynamic, in first-occurrence source order (omitted if empty). |

Forward-compat policy: the runtime checks `__meo$` against the schema
version(s) it understands and falls back to its normal classification path
for anything it doesn't recognize — an unknown/future schema number is
ignored rather than crashing, so this plugin and the `@meonode/ui` runtime
can evolve the marker shape independently as long as both sides keep this
rule.

## Version compatibility

Plugin crate pinned to **`swc_core = "74"`** (currently resolving to
`74.0.2`), feature `ecma_plugin_transform`.

| Host | Version | Bundler | Status |
|---|---|---|---|
| Next.js | 16.2.11 | Turbopack | Verified |
| Next.js | 16.2.11 | webpack (`next build --webpack`) | Manually verified (not in automated e2e; Turbopack + Vite are) |
| Vite (`@vitejs/plugin-react-swc`) | 4.3.2 | esbuild/Rollup + SWC transform | Verified |
| `@swc/core` | 1.15.46 | (used directly by wasm-smoke tests) | Verified |

**SWC WASM ABI caveat**: the plugin/host boundary is a versioned wire
protocol (`ecma_plugin_transform`), not a linked ABI — the AST is serialized
across the WASM boundary, so a plugin built against a newer `swc_core` can
generally run under an older host as long as both sides speak a compatible
schema generation. This is *not* an unconditional guarantee: hosts do
occasionally bump their accepted plugin ABI generation in ways that reject
older or newer plugins outright. If the plugin fails to load under your
exact host/`@swc/core` version, check
[plugins.swc.rs](https://plugins.swc.rs) for the ABI/version compatibility
matrix before filing an issue — and remember bailing (plugin not loading at
all) is always safe; `@meonode/ui` runs correctly without it.

Release policy: a new `@meonode/compiler` release ships for every `swc_core`
minor version bump this crate adopts, so the published version compatibility
table above stays current with what's actually pinned in `Cargo.toml`.

## Development

```bash
bun install

bun run codegen        # regenerate css_props.rs + factories.rs from @meonode/ui
bun run check:drift     # regenerate + fail on any diff (run before releasing)
bun run build:wasm      # cargo build --release --target wasm32-wasip1, copies into npm/
bun run test            # cargo test --workspace + vitest (unit/fixture + wasm smoke + equivalence)
bun run test:e2e        # Next Turbopack + Vite real-build parity fixtures (slow — real bundler builds)
```

`@meonode/ui` is a released dependency now that schema 2 runtime support has
shipped: the root `package.json` tracks `^2.0.0-beta.0`, while `e2e/next-app`
and `e2e/vite-app` pin the exact version (`2.0.0-beta.0`) so real-bundler
parity runs stay reproducible. Bump the e2e pins deliberately when validating
against a newer `@meonode/ui` — an exact pin is the point, so they cannot drift
onto a different runtime than the one the parity run claims to cover.

Test coverage as of this writing: 115 Rust tests (unit + SWC fixture tests),
24 Vitest tests (9 WASM artifact smoke tests via `@swc/core`'s real plugin
host, 8 server-side semantic-equivalence tests, 7 client-side), plus the
`test:e2e` Next/Vite real-bundler parity suite.

`crates/meonode-swc-plugin/src/css_props.rs` (689 recognized CSS properties)
and `src/factories.rs` (139 `@meonode/ui` HTML factories) are both generated
from `@meonode/ui`'s own exports — the same source of truth the runtime's
static/dynamic classification uses — and are committed to git. `check:drift`
regenerates both and fails the command if `@meonode/ui` has moved out from
under the committed snapshot; CI runs this in the `css-drift` job against a
source checkout of `@meonode/ui` (see `.github/workflows/ci.yml`), so drift
is caught on every push/PR, not just as a local/manual pre-release step.

### Publishing

Publishing is driven by Changesets from the monorepo root
(`.changeset/config.json`, `.github/workflows/release.yml`), shared with
`@meonode/ui` and `@meonode/mui`, each versioned independently.

The publishable package is `npm/`, not this directory — that is why it is its
own workspace member, so Changesets versions `npm/package.json` and
`npm publish` runs from there. This directory (`@meonode/compiler-repo`) is
private and holds the crate, the codegen and the test suites.

Releasing takes two merges. A change lands on `main` with a `.changeset/*.md`
describing its bump; that opens a "Version Packages" pull request holding the
version bump and changelog. Merging that publishes and tags
`@meonode/compiler@<version>`. Prereleases go through
`changeset pre enter beta` rather than a long-lived branch.

Publishing stays tokenless: npm OIDC trusted publishing (`id-token: write`
plus `actions/setup-node`'s `registry-url`, no `NPM_TOKEN` secret). Each run
rebuilds the wasm first, so the published artifact always comes from the
commit being released.

For historical context: npm requires a package to already exist on the registry
before trusted publishing can be configured for it, so `0.1.0` was published by
hand once. Trusted publishing is configured on npmjs.com against GitHub repo
`l7aromeo/meonode`, workflow `release.yml`, environment `Production` — it was
repointed there when the three repositories were merged into the monorepo, and
needs updating again only if the repository or workflow filename changes.

## Layout

```
Cargo.toml                          workspace
rust-toolchain.toml
crates/meonode-swc-plugin/
  Cargo.toml                        crate-type = ["cdylib", "rlib"]
  src/lib.rs                        plugin entry point
  src/detect.rs                     call-site detection + bailout decisions
  src/effect.rs                     side-effect-freedom classifier
  src/order.rs                      evaluation-order safety analysis (v0.2 rule)
  src/keys.rs                       shared special-key / key-name utilities
  src/config.rs                     plugin config (`factoryModules`)
  src/partition.rs                  prop partitioning + marker emission
  src/css_props.rs                  @generated — see Development
  src/factories.rs                  @generated — see Development
  tests/                            SWC fixture tests
npm/
  package.json                      "@meonode/compiler", main → .wasm
  meonode_swc_plugin.wasm           build artifact, not committed to git
e2e/                                Next.js + Vite real-build parity fixtures
scripts/                            codegen for css_props.rs / factories.rs
.releaserc.json                     semantic-release config (pkgRoot: npm)
.github/workflows/ci.yml            cargo test, wasm build, wasm smoke tests, e2e (gated)
.github/workflows/release.yml       semantic-release + npm OIDC trusted publishing (see Publishing)
```

## License

MIT
