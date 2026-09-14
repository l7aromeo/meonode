# @meonode/compiler

## 0.9.0

### Minor Changes

- [#19](https://github.com/l7aromeo/meonode/pull/19) [`04959df`](https://github.com/l7aromeo/meonode/commit/04959dfbeb0ed34c0d2841e8ce865f5a31e1668e) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Say where an unkeyed list came from.

  React cannot answer that in a MeoNode app. `Div({...})` only builds a node;
  `createElement` fires later inside `.render()`, so React attributes every element
  in the tree to that one call — every missing key anywhere in a file reports at
  the same line, and the owner stack collapses to the same component for the same
  reason.

  The compiler already computed the call site and discarded it. With the new
  `callSiteLocations` option it emits the source position, and the runtime names it
  beside React's own report rather than in place of it:

  ```
  [MeoNode] A generated list at src/app/page.ts:124:6 has children without a `key`.
  ```

  It prints only when a child actually lacks a key, so a correctly keyed list stays
  silent. It also prints in the one case React says nothing at all: a marked list
  whose children reach a host element through an unmarked wrapper, where the
  variadic hand-off tells React a human wrote the siblings out.

  Opt in through the plugin options. The locations are absent from any build that
  does not ask for them; with them on, the whole of a 55-file app grew by 759 bytes
  gzipped.

## 0.8.0

### Minor Changes

- [#16](https://github.com/l7aromeo/meonode/pull/16) [`1c68d40`](https://github.com/l7aromeo/meonode/commit/1c68d402759581f6ef0d897e6a7b9dc7673488e2) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Record at each call site whether its children were written out or generated.

  React matches unkeyed children by position, so deleting or reordering a list
  hands each surviving row the previous row's fiber — its state, its focus,
  whatever the user had typed. React reports that; `@meonode/ui` could not,
  because the decision cannot be made from the value. Arguments are evaluated
  before the callee runs, so by the time `Div({ children })` is entered,
  `items.map(fn)` has already collapsed into an ordinary array, indistinguishable
  from one typed out by hand. Only the source still knows, which makes it the
  compiler's question.

  Call sites are now classified and the answer travels as `__meo$list: 1` on
  schemas 2 and 3, absent when the children were authored. This is the same thing
  React's own JSX transform does with its `isStaticChildren` flag, at the same
  layer — not a heuristic.

  The rule is inverted on purpose: a literal array of authored elements is
  static, and everything else is generated. Enumerating the ways to produce
  children has no end — `.map`, `.reduce`, `filter().map()`, `flatMap`,
  `Array.from`, `Object.values().map()`, a `for` loop, a generator, an
  immediately invoked function, a bare identifier, a helper call — while the
  authored form has exactly one shape. Every one of those falls out with no rule
  of its own, and the classifier stays exhaustive as the language grows idioms.

  Three cases needed more than the shape of the expression:

  - **Children-first factories.** `Span(rows, { padding: 8 })` passes children as
    argument 0, and `createChildrenFirstNode` merges them last, so they override
    any `children` in the props object. Reading the props object there was wrong
    in both directions: real lists went unreported, and a dead `children` prop was
    reported for children that never render. The source is now chosen by factory
    kind rather than argument position.
  - **A props-less children-first call.** `Span(items.map(fn))` has nowhere to put
    the marker, so a props object is synthesized — gated on the children being
    generated, so a call's shape only changes where there is something to report.
  - **A trailing spread.** `Div({ children: ['a'], ...rest })` is generated: the
    spread can replace `children`, so what renders is not what the call site
    wrote. A leading spread is not, since the written property wins.

  `Div({ ...rest })` with no written `children` stays authored. A spread may carry
  some, but marking every wrapper component would bury the real reports.
  Documented as a known false negative rather than left implicit.

  The README now states the runtime floor for each marker separately, because
  they are different: schema 2 buckets from `@meonode/ui@1.7.0`, schema 3 from
  `1.8.0` — not the `1.7.0` previously advertised, which has been wrong for
  schema-3 output since `0.2.0` — and `__meo$list` from whichever release first
  carries a `list` entry in its schema keys, which is none of them yet. A reader
  is told to test that capability rather than a version number.

### Patch Changes

- [#17](https://github.com/l7aromeo/meonode/pull/17) [`4fab054`](https://github.com/l7aromeo/meonode/commit/4fab0540eddf63d73eda63629e9311de06707c75) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Replace a runtime-support check the reader cannot run.

  The compatibility section told readers to detect `__meo$list` support by
  inspecting `COMPILER_SCHEMA_KEYS` for a `list` field. `@meonode/ui` does not
  export that constant, or `COMPILED_MARKER`, or `SUPPORTED_COMPILER_SCHEMAS` —
  the marker contract is internal — so the check could not be written, and a
  reader who tried would find nothing to import.

  It now points at the symptom instead, which needs no exports: a runtime that
  does not know the key logs `Invalid attribute name: __meo$list` once per render
  of every marked call site, and one that does know it reports React's own
  missing-key warning for unkeyed generated lists. The two are mutually
  exclusive, so the console says which side of the boundary you are on.

  This README is copied into the published package by `build:wasm`, so the
  unrunnable instruction would have shipped.

## 0.7.1

### Patch Changes

- [#10](https://github.com/l7aromeo/meonode/pull/10) [`7482625`](https://github.com/l7aromeo/meonode/commit/74826251a0f5c28b9e9b54620da28141db77f470) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Correct what the README claims about memoization and re-measure the benchmarks.

  It said compiled call sites "cannot collide that way". They could: `__meo$k` is
  a source-position hash, so it separated distinct call sites, but two instances
  of the _same_ component share a source position and collided even in a compiled
  build. Verified against both a compiled and an uncompiled build before rewriting.

  `@meonode/ui@2.0.0-beta` removes the derived-key machinery entirely, which
  closes that class and leaves `__meo$k` and `__meo$dyn` emitted but unread. The
  measured figures move with it — most of what compiling bought was the signature
  hashing the runtime no longer does, so construction reads ~1.7x rather than ~4x
  against a runtime that is itself ~2.4x faster. The end-to-end SSR figure has not
  been re-run and is now marked unverified rather than left standing as current.

- [#7](https://github.com/l7aromeo/meonode/pull/7) [`dbe025a`](https://github.com/l7aromeo/meonode/commit/dbe025a6f125f48337f5780a7e65c068c4145c72) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Point `homepage` and the README at the documentation site.

  Both packages sent readers to their GitHub folder instead of the docs.
  `@meonode/ui` already links to `ui.meonode.com`, so these were the two
  outliers, and npm package pages are among the strongest signals pointing
  at the docs domain — which Google currently reports as 0 indexed pages,
  19 not indexed, with the whole site sitting in "Crawled - currently not
  indexed" three months after the domain move.

  `homepage` now deep-links to each package's own page —
  `/docs/mui-integration` and `/docs/getting-started/compiler` — and both
  READMEs carry a Documentation link near the top, where npm renders it.

## 0.7.1-beta.0

### Patch Changes

- [`7482625`](https://github.com/l7aromeo/meonode/commit/74826251a0f5c28b9e9b54620da28141db77f470) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Correct what the README claims about memoization and re-measure the benchmarks.

  It said compiled call sites "cannot collide that way". They could: `__meo$k` is
  a source-position hash, so it separated distinct call sites, but two instances
  of the _same_ component share a source position and collided even in a compiled
  build. Verified against both a compiled and an uncompiled build before rewriting.

  `@meonode/ui@2.0.0-beta` removes the derived-key machinery entirely, which
  closes that class and leaves `__meo$k` and `__meo$dyn` emitted but unread. The
  measured figures move with it — most of what compiling bought was the signature
  hashing the runtime no longer does, so construction reads ~1.7x rather than ~4x
  against a runtime that is itself ~2.4x faster. The end-to-end SSR figure has not
  been re-run and is now marked unverified rather than left standing as current.

- [#7](https://github.com/l7aromeo/meonode/pull/7) [`dbe025a`](https://github.com/l7aromeo/meonode/commit/dbe025a6f125f48337f5780a7e65c068c4145c72) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Point `homepage` and the README at the documentation site.

  Both packages sent readers to their GitHub folder instead of the docs.
  `@meonode/ui` already links to `ui.meonode.com`, so these were the two
  outliers, and npm package pages are among the strongest signals pointing
  at the docs domain — which Google currently reports as 0 indexed pages,
  19 not indexed, with the whole site sitting in "Crawled - currently not
  indexed" three months after the domain move.

  `homepage` now deep-links to each package's own page —
  `/docs/mui-integration` and `/docs/getting-started/compiler` — and both
  READMEs carry a Documentation link near the top, where npm renders it.

## 0.7.0

### Minor Changes

- [#4](https://github.com/l7aromeo/meonode/pull/4) [`151fdf5`](https://github.com/l7aromeo/meonode/commit/151fdf5421ae928ea454956b16710a99320ed5be) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Rewrite `theme.*` tokens inside `css` blocks at build time.

  The token rewrite previously stopped at the top level of a props object, so
  every token in a `css:` block was still converted on each render. It now
  recurses into `css` object literals, choosing the plain or `--len` variable form
  from the nearest enclosing property — with selectors and at-rules (`&:hover`,
  `@media …`) contributing none, matching `@meonode/ui`'s own rule.

  Keys are still never rewritten: `var()` is invalid inside media features and
  selector text, so a token in a key must resolve against the live theme at
  runtime. Arrays and tokens in non-selector keys are skipped for the same
  reason — the property name they resolve to is not knowable at build time.

  Beyond skipping the string replacement, a `css` block whose keys hold no tokens
  now scans clean in `ThemeUtil.resolveObjWithTheme`, so its whole copy-on-write
  walk collapses to returning the input unchanged.

## 0.6.2

### Patch Changes

- [#1](https://github.com/l7aromeo/meonode/pull/1) [`5d234ac`](https://github.com/l7aromeo/meonode/commit/5d234acb9d15dc77de33eff8624d5eb9a2622e37) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Point the package metadata at the new monorepo. `repository`, `bugs` and `homepage` referenced the three separate repositories that have now been merged into [l7aromeo/meonode](https://github.com/l7aromeo/meonode), and each package gains a `repository.directory` so npm links to its own subtree. No functional change — npm reads these fields from the published tarball, so a release is the only way to correct them.
