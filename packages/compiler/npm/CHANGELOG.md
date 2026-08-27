# @meonode/compiler

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
