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

`__meo$list: 1` joins these on a call site whose `children` expression was
*generated* rather than written out — a `.map()`, a spread, an identifier, a
helper call. The example above does not carry it, because `[A, B]` is an array
the author typed. Whether children were authored or generated cannot be
recovered at runtime (arguments are evaluated before the callee runs, so
`items.map(fn)` is an ordinary array by the time the factory is entered), so the
compiler records the answer and `@meonode/ui` passes generated children to
`createElement` as one array instead of spreading them, which is what makes
React ask for the keys a list needs.

An identifier that hands on the `children` the enclosing component or helper
was given is the exception: `({ children }) => Div({ children })`,
`props.children`, `props?.children`, `rest.children`, a renamed
`{ children: kids }`, an unchanged alias of one of these, and
`this.props.children` in a class component. Those children were written at the
caller, so the wrapper's call site carries no `__meo$list`. The binding must be
the `children` of the function's first parameter, never reassigned, and the
function must not be a callback written inline in a call (other than React's
`memo` and `forwardRef`), whose first parameter is whatever the callee hands
it. A value derived from the children (`children.filter(…)`,
`[...children, extra]`) is still generated.

`@meonode/ui`'s runtime fast path detects the `__meo$` marker and uses the
namespaced buckets directly instead of re-deriving them, skipping the
classification pass entirely.

### Runtime version requirements

Four different floors, because the plugin gained emissions over time and a
runtime only strips the marker keys its own `COMPILER_SCHEMA_KEYS` names. A key
the runtime does not know is not ignored — it reaches `getDOMProps`, which is a
denylist, and React rejects the attribute name once per render per call site.
Every row below was measured against the published tarball, not inferred:

| Output | Requires | On an older runtime |
| --- | --- | --- |
| Schema 2 marker + `c`/`d`/`k`/`dyn` buckets | `@meonode/ui@1.7.0` | 1.6.2 and earlier have no `COMPILED_MARKER` at all, so every one of the five keys falls through as an ordinary prop — five `Invalid attribute name` lines per call site |
| Schema 3 marker (call sites the plugin cannot partition) | `@meonode/ui@1.8.0` | 1.7.0–1.7.8 set `SUPPORTED_COMPILER_SCHEMAS` to `{1, 2}`, so the whole marker object falls through as ordinary props — `Invalid attribute name: __meo$`, and again for `__meo$k` |
| `__meo$list` (generated-children reporting) | `@meonode/ui@2.1.0` | 2.0.2 and earlier lack a `list` entry in `COMPILER_SCHEMA_KEYS`, and the compiled path strips by exact name — `Invalid attribute name: __meo$list`, once per render per marked call site |
| `__meo$loc` (call-site locations, opt-in) | `@meonode/ui@2.2.0` | 2.1.0 has no `loc` entry, so the key falls through — measured against the 2.1.0 tarball: `Invalid attribute name: __meo$loc`, while `__meo$list` beside it is stripped cleanly. Only reachable with `callSiteLocations` enabled |

**`2.0.0` or later is recommended**: it removed the derived-key machinery
outright, which fixed a class of memoization collision the plugin could only
narrow (see [measured effect](#measured-effect)).

The location row is the one to read carefully, because the two halves ship
together: `__meo$loc` is emitted by this plugin and consumed by the runtime
released alongside it. 2.1.0 strips `__meo$list` but has never heard of
`__meo$loc`, so a new plugin against that runtime is the one combination that
misbehaves.

The version is in the table, but the symptom is the faster check. A runtime
that does not know the key logs `Invalid attribute name: __meo$loc` once per
render of every marked call site; a runtime that does know it logs nothing, and
an unkeyed generated list instead gets React's own missing-key report with a
`[MeoNode]` line beside it naming the call site. Those two are mutually
exclusive, so whichever the console shows tells you which side of the boundary
you are on. It only applies at all with `callSiteLocations` enabled — without
it there is no key to strip or forward.

There is deliberately no code snippet here. `COMPILER_SCHEMA_KEYS` and the rest
of the marker contract are internal to `@meonode/ui` and not exported, so a
feature test written against them would not compile — the console is the only
check a reader can actually run.

Nothing here is a correctness failure — the leaked keys never reach the DOM,
because React rejects the name rather than writing the attribute. The cost is
console noise, on the same channel the missing-key reports use.

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
| Node construction in isolation (`@meonode/ui`'s `bench/node-construction.mjs`) | **3.06–3.16x faster** |
| Client render, mount plus 40 re-renders, token-free (`@meonode/ui`'s `bench/client-render.mjs`) | **1.11–1.16x faster** |
| Client render, the same with a token in every style value | **1.18–1.19x faster** |
| End-to-end SSR, 156-node tree, partitioning + theme rewrite (`e2e/bench-theme-tokens.mjs`) | **1.32–1.39x faster** (24.2–28.1% less time) |
| End-to-end SSR, partitioning only (`--no-tokens`) | **1.15–1.18x faster** (13.2–14.9% less time) |

Each range is three runs of `@meonode/compiler` 0.10.3 against `@meonode/ui`
3.2.0 with the next release's changes (commit `d3bafea`), on 2026-11-20, on an
Apple M4 Pro with Node 26.13, `NODE_ENV=production`. The 1-minute load average
was 5.1–6.2 at every step. The `@meonode/ui` benches ran from `packages/ui`
after `bun run build` at the repository root; the SSR bench ran in this package
as `node e2e/bench-theme-tokens.mjs 400`, with and without `--no-tokens`.

Against `@meonode/ui@1.x` the first two figures read ~4x and ~1.6x, but most of
what they measured was the stable-key hashing the runtime no longer does at all:
uncompiled construction got ~2.4x faster in `2.0.0-beta`, so there is less left
for compiling to remove. What remains is prop classification and the
theme-token rewrite.

The construction figure excludes React, Emotion and the DOM; it is the ceiling
on what compiling can remove, not what a page render improves by. The client
figures render through React and Emotion in jsdom, so they are what a client
render improves by.

The end-to-end SSR figure renders the whole tree, React and Emotion included, so
it is what a server render improves by.

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

against @meonode/ui 3.2.0 with the next release's changes, compiler 0.10.3
  partitioning only:              0.9682 -> 0.8282 ms/render   14.5% faster
  partitioning + theme rewrite:   1.1996 -> 0.8907 ms/render   25.6% faster
```

The 3.2.0 line is the median of the three runs above. The 1.7.x lines are
medians of alternating runs on the same machine at an unrecorded load; compare
percentages across lines, not absolute times.

Against 1.7.4 the compiled timings are ~0.83 ms in both modes — compiled props are token-free
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

Needs **Next 16.4 or later**. Verified against **Next 16.4.6**:

- **Turbopack** (`next build`, `next dev`) — the default bundler as of
  Next 16, and the primary target for this config shape.
- **webpack** (`next build --webpack`) — same `experimental.swcPlugins`
  config works unchanged; Next's webpack build path loads SWC plugins
  through the same `next-swc` binary as Turbopack does.

On Next 16.3 or earlier, use `@meonode/compiler` 0.9.x — see
[Version compatibility](#version-compatibility).

### Vite

Requires [`@vitejs/plugin-react-swc`](https://www.npmjs.com/package/@vitejs/plugin-react-swc)
(verified at `4.3.3`) — Vite's default `@vitejs/plugin-react` uses Babel, not
SWC, and can't load SWC plugins at all.

The plugin runs inside the `@swc/core` that `@vitejs/plugin-react-swc`
loads, and it needs **`@swc/core` 1.16 or later**. The Vite plugin accepts
`@swc/core` `^1.15.46`, so an existing lockfile can keep a 1.15 copy, even
nested under the Vite plugin, after everything else is upgraded. Check with
`npm ls @swc/core`, and add `@swc/core@^1.16` to your devDependencies if
1.15 shows up.

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

A plugin built for a different swc generation than its host does not fall
back to the runtime path. The host fails on the first file that contains a
function, with an error like

```
Failed to deserialize program received from host
```

and the build stops. Install the `@meonode/compiler` version made for your
host; [Version compatibility](#version-compatibility) lists them. To build
without the plugin, remove it from the config: `@meonode/ui` runs correctly
without it, through its normal runtime classification, just without the
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
they name no property. A key names the same property in any form Emotion writes
as it: `paddingTop`, `'padding-top'`, `'-webkit-margin-start'`. This mirrors `@meonode/ui`'s own
`isSelectorOrAtRule(key) ? undefined : key` rule, applied in both of its
conversion paths.

Two nested shapes are deliberately skipped:

- **Arrays.** The runtime converts every string item in an array, on the
  server and the client alike: an item of a length property's fallback list
  (`padding: ['1px', 'theme.spacing.md']`) against that property, any other item
  as CSS text, where each declaration names its own property. Leaving arrays to
  the runtime therefore renders the same output as compiling them would; only
  the conversion happens at render time instead of build time.
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

### `callSiteLocations` — where a generated list was written

React's missing-key report says *what* is wrong and cannot say *where*.
`Div({...})` only builds a node; `createElement` fires later, inside
`.render()`, so every element in the tree is created by that one call and React
attributes them all to it. Its report ends "check the top-level render call" for
a list written anywhere in the file, and its owner stack collapses for the same
reason — every owner is the component that called `.render()`. The compiler is
the only thing that still knows where a call site was.

Enabling this emits `__meo$loc` — `file:line:column` — beside `__meo$list`:

```js
// Next.js
experimental: {
  swcPlugins: [['@meonode/compiler', { callSiteLocations: true }]],
}

// Vite
react({ plugins: [['@meonode/compiler', { callSiteLocations: true }]] })
```

`@meonode/ui` prints it *beside* React's report, never instead of it — no React
message is reproduced — and only when a row is actually missing a key, so a
fully keyed list stays silent. It is gated on the same
`diagnosticsEnabled()` as every other MeoNode diagnostic, meaning it appears in
an ordinary `next dev` run and never in a production build.

**Off by default, and deliberately opt-in rather than inferred.** The plugin has
no reliable signal for whether the host is building for development or
production, so guessing would either ship source paths into production bundles
or withhold them from the builds that want them. A build that does not ask
carries no locations at all.

Measured on a 55-file application with 17 files containing a marked list, 65
keys emitted: **+4,747 bytes of transform output (1.44%), +759 bytes gzipped
(0.92%)**. Locations are emitted only alongside `__meo$list`, never on an
authored call site, so the cost scales with how many generated lists a codebase
has rather than with its size.

### `experimental_extractCss` — styles written at build time (experimental)

A prototype, needing a `@meonode/ui` that exports `registerStaticCss` and
`toCssValue`. The name and the output may change before it ships.

```js
experimental: {
  swcPlugins: [['@meonode/compiler', { experimental_extractCss: true }]],
}
```

For a call site of a plain host factory (`Div`, `Span`, …, or `Node('section', …)`)
or a layout factory (`Row`, `Column`, `Center`, `Absolute`, …), every style entry
the compiler can prove is written as a CSS rule when the module is built. The call site then carries class names (`__meo$s`) and, for values only
known at runtime, CSS variables (`__meo$v`). Each module registers its rules once
through `registerStaticCss`. Anything the compiler cannot prove stays where it
was, and the runtime handles it as before.

- **Written at build time:** literals, `theme.*` token strings and same-file
  `const` literals; a conditional whose branches are all of those; and a template
  literal or arithmetic, through a variable. Inside a nested selector whose
  rule styles the node itself (`.dark &`, `&:where(.x)`), a template literal, an
  arithmetic value, or a conditional whose every branch is a value is written
  through a variable too. Under a selector reaching another element (`& p`), or
  with a branch that sets nothing, it stays on the runtime path: the variable
  would come from the nearest ancestor setting it, or compute to `unset`, where
  Emotion's rule order or a lower rule decides.
- **Left to the runtime:** identifiers and member reads (they may hold a theme
  function or nothing), calls, theme functions, fallback arrays, spreads, and
  component targets. An at-rule other than `@media`, `@supports` or
  `@container`, or one with a token in its key, stays on the runtime path with
  its contents, and the rest of the node is still extracted. A property it sets
  keeps its family on the runtime path too (`@keyframes` sets none). A
  selector naming the node twice (`& + &`, `& &`) keeps the whole node on the
  runtime path, since it matches only nodes styled alike in full. So does one
  naming the node only inside `:not()`, `:is()`, `:where()` or their vendor
  forms (`html:not(&) p`, `.b:is(&, .a)`), since it matches elements other than
  the node. `:has(&)` and `&:not(.a)` are extracted.
- **Same output as the runtime.** Values are written the way Emotion writes them,
  vendor prefixes included. Nested selectors and at-rules are composed the way
  Emotion composes them (stylis's parser, then Emotion's `compat` plugin): a key
  starting with a colon attaches to its parent (`":hover"` is `&:hover`, and
  `":not(&)"` is `&:not(&)`), a list item without `&` is a descendant,
  whitespace is dropped around combinators, and `::placeholder`,
  `:read-only` and `:read-write` rules get Emotion's vendor copies. A property is never split between a build-time rule
  and a runtime one on the same node. Shapes whose result depends on declaration
  order stay on the runtime path: `padding` beside `paddingTop`, and one property
  under two pseudo-classes or two media queries. Which properties overlap comes
  from the CSS specifications' shorthand and logical property tables (through
  `@webref/css`), so `border` beside `borderRadius` is extracted, while `border`
  beside `borderColor`, or `marginBottom` beside `marginInline`, is not.

- **Layout factories.** A layout factory's initial props (`display: 'flex'`,
  `flexDirection: 'row'`, …) are merged in front of the call site's, as
  `createNode` merges them, and extracted with them. The call site then carries
  `__meo$i`, a fingerprint of those initial props; a `@meonode/ui` whose factory
  has the same initial props uses the call site's props as given instead of
  merging again, so the element renders plain.

Off by default. With the option off, the output is exactly what it is without
this option.

## Marker contract

Compiled call sites get a marker object, recognized by the `__meo$` key. This
plugin emits **schema 2** for a partitioned call site and **schema 3** for one
it can key but not partition; schema 1 is the retired shape whose bucket names
were unprefixed, and is documented under [runtime version
requirements](#runtime-version-requirements) rather than emitted.

| Key | Meaning |
|---|---|
| `__meo$` | Marker schema version — `2` when the props were partitioned, `3` when only the call-site key was stamped. |
| `__meo$c` | Bucket of props recognized as CSS/static props (omitted if empty; schema 2 only). |
| `__meo$d` | Bucket of props recognized as dynamic/DOM props (omitted if empty; schema 2 only). |
| `__meo$k` | Deterministic call-site key (`m` + base36 FNV-1a64 hash of `filename:span`), used by the runtime to key the generated class name without re-hashing the prop signature. |
| `__meo$dyn` | Names of bucketed props (from `__meo$c` or `__meo$d`) whose value isn't a plain literal — i.e. props the runtime still needs to treat as reactive/dynamic, in first-occurrence source order (omitted if empty). |
| `__meo$list` | Present, as `1`, only when this call site's `children` expression was *generated* rather than written out or passed through from the caller. Absent otherwise — there is no `0`. |
| `__meo$s` | Class names of the call site's build-time rules, with `experimental_extractCss` (omitted when nothing was extracted). |
| `__meo$v` | CSS variables the build-time rules read, keyed by name, for values only known at runtime (omitted if none). |
| `__meo$i` | On a layout factory's call site with `__meo$s`: the fingerprint of the initial props merged into it, `key:value;` per prop in key order. A runtime whose factory has the same fingerprint skips its own merge. |
| `__meo$loc` | `file:line:column` of a call site carrying `__meo$list`, emitted only when [`callSiteLocations`](#callsitelocations--where-a-generated-list-was-written) is enabled. |

Forward-compat policy: the runtime checks `__meo$` against the schema
version(s) it understands and falls back to its normal classification path
for anything it doesn't recognize — an unknown/future schema number is
ignored rather than crashing, so this plugin and the `@meonode/ui` runtime
can evolve the marker shape independently as long as both sides keep this
rule.

## Version compatibility

The host hands the plugin the whole program, serialized in the host's own
AST schema, so the plugin has to be built for the same swc AST generation as
its host. `@swc/core` 1.16.0 changed that schema for every function body
(swc_core 77, "Introduce FunctionBody", marked breaking in the swc
changelog), which splits the hosts into two lines:

| `@meonode/compiler` | Built on | Next.js | `@swc/core` (directly, or under `@vitejs/plugin-react-swc`) |
|---|---|---|---|
| 0.10.0 and later | `swc_core` 84 | 16.4.0 and later | 1.16.0 and later |
| 0.9.x | `swc_core` 74 | 16.3.x and earlier | 1.15.x |

A plugin on the wrong side of the line fails the build; see
[If the plugin doesn't load](#if-the-plugin-doesnt-load).

**Upgrading.** On Next 16.3 or earlier, or `@swc/core` 1.15, stay on 0.9.x.
A `^0.9.0` range never installs 0.10.0, so nothing changes until you move it.
Move to `^0.10.0` in the same change that moves the host to Next 16.4 or
`@swc/core` 1.16.

CI checks both lines on every compiler change, with markers required in the
compiled output and the compiled page required to render the same as an
uncompiled build:

| Plugin | Host |
|---|---|
| this checkout | `@swc/core` 1.16.0, and the latest `@swc/core` |
| this checkout | Next 16.4.6, Turbopack and webpack |
| this checkout | Vite 8.3.8, `@vitejs/plugin-react-swc` 4.3.3, `@swc/core` 1.16.22 |
| this checkout | the latest Next, `@vitejs/plugin-react-swc` and `@swc/core`, resolved fresh, so a new host generation fails CI |
| 0.9.0 from npm | `@swc/core` 1.15.47 |
| 0.9.0 from npm | Next 16.3.8, Turbopack and webpack |

The swc project's own table at
[plugins.swc.rs](https://plugins.swc.rs/versions/range) maps `swc_core`
51–76 to Next 16.1.6–16.3.8 and `@swc/core` 1.15.6–1.15.47, and `swc_core` 77
to `@swc/core` 1.16.0–1.16.1. It lists no range above `swc_core` 78 yet, so
the 0.10.0 line above is measured, not taken from that table.

Release policy: when swc changes the AST generation again, the plugin moves
to it in a new minor version, and this table gains a line saying which
version serves which hosts.

## Development

```bash
bun install

bun run codegen        # regenerate css_props.rs + factories.rs from @meonode/ui
bun run check:drift     # regenerate + fail on any diff (run before releasing)
bun run build:wasm      # scripts/build-wasm.ts: cargo build --release --target wasm32-wasip1, copies into npm/
bun run build:wasm:linux-x64  # the same build in a Linux x86_64 Docker container, as CI and the release build
bun run test            # cargo test --workspace + vitest (unit/fixture + wasm smoke + equivalence)
bun run test:e2e        # Next Turbopack + Vite real-build parity fixtures (slow — real bundler builds)
```

The wasm build is reproducible: one commit builds to the same bytes on any
machine of the same OS and CPU type. `rust-toolchain.toml` pins the exact Rust
version, and `scripts/build-wasm.ts` remaps the cargo home, target directory and
workspace root out of the paths rustc writes into the binary. The build host's
type still reaches the bytes through cargo and rustc
([rust-lang/cargo#8140](https://github.com/rust-lang/cargo/issues/8140),
[rust-lang/rust#165736](https://github.com/rust-lang/rust/issues/165736)), so
a macOS, Windows or arm64 build differs from the published one. The release
builds on Linux x86_64. To check a release, build its commit with
`bun run build:wasm:linux-x64` (or `bun run build:wasm` on Linux x86_64) and
compare the sha256 of `npm/meonode_swc_plugin.wasm` with the one in that
version's tarball. That runs the build in Docker on linux/amd64, in the official
`rust` image tagged with the pinned version; the image only supplies that Rust
for Linux x86_64, the same toolchain rustup installs on CI. CI and the
release install the toolchain from that file too, so moving to a newer Rust
means editing `rust-toolchain.toml`, and the wasm's bytes change with it even
when the source does not.

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
rust-toolchain.toml                 exact Rust version, so the wasm is reproducible
crates/meonode-swc-plugin/
  Cargo.toml                        crate-type = ["cdylib", "rlib"]
  src/lib.rs                        plugin entry point
  src/detect.rs                     call-site detection + bailout decisions
  src/effect.rs                     side-effect-freedom classifier
  src/order.rs                      evaluation-order safety analysis (v0.2 rule)
  src/keys.rs                       shared special-key / key-name utilities
  src/config.rs                     plugin config (`factoryModules`, `callSiteLocations`)
  src/partition.rs                  prop partitioning + marker emission
  src/css_props.rs                  @generated — see Development
  src/factories.rs                  @generated — see Development
  tests/                            SWC fixture tests
npm/
  package.json                      "@meonode/compiler", main → .wasm
  meonode_swc_plugin.wasm           build artifact, not committed to git
e2e/                                Next.js + Vite real-build parity fixtures
scripts/                            codegen for css_props.rs / factories.rs, reproducible wasm build
.releaserc.json                     semantic-release config (pkgRoot: npm)
.github/workflows/ci.yml            cargo test, wasm build, wasm smoke tests, e2e (gated)
.github/workflows/release.yml       semantic-release + npm OIDC trusted publishing (see Publishing)
```

## License

MIT
