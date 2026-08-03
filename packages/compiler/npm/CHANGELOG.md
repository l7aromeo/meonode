# @meonode/compiler

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
