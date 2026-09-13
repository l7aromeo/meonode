# @meonode/mui

## 2.1.0

### Minor Changes

- [#16](https://github.com/l7aromeo/meonode/pull/16) [`4b02f61`](https://github.com/l7aromeo/meonode/commit/4b02f615bd945950c2f1ea2ce1e0833c862c76f3) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Update the Material UI packages, and raise the React floor.

  `@mui/material` and `@mui/material-nextjs` move to 9.4, the `@mui/x-*` family
  to 9.13, and `@mui/lab` to `9.0.0-beta.9`. `@mui/x-charts` stays pinned to an
  exact version rather than a range, as it was before.

  Regenerating the wrappers against those versions adds seven components that did
  not exist in 9.10: `ToolbarRoot` for each of the three data grids, and
  `TreeItemLoader` and `TreeItemLoaderRoot` for both tree views.

  **The React peer requirement moves from `>=19.2.8` to `>=19.3.0`.** Nothing in
  this MUI release needs it — every package involved accepts `^19.0.0` — so this
  is a deliberate raise rather than a consequence, and it is called out here
  because a minor version will not signal it. Installing `@meonode/mui` on React
  19.2.x will now fail the peer check. `@meonode/ui` is unchanged at `>=19.2.0`,
  so the two packages no longer share a floor.

  Also pins `tsc-alias` to `1.9.1` here and in `@meonode/ui`. 1.9.5 resolves
  `paths` only when `baseUrl` is also set, and `baseUrl` is deprecated in
  TypeScript 6 and stops working in 7 — so the newer `tsc-alias` cannot be used
  with a config that modern TypeScript accepts. Left unpinned, it silently
  emitted `export * from '@src/...'` into `@meonode/ui`'s declarations, which
  nothing downstream can resolve; the failure surfaced in this package, because
  its typecheck is the first consumer of those files.

## 2.0.0

### Patch Changes

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

## 2.0.0-beta.0

### Patch Changes

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

- Updated dependencies [[`7482625`](https://github.com/l7aromeo/meonode/commit/74826251a0f5c28b9e9b54620da28141db77f470)]:
  - @meonode/ui@2.0.0-beta.0

## 1.5.11

### Patch Changes

- [#1](https://github.com/l7aromeo/meonode/pull/1) [`5d234ac`](https://github.com/l7aromeo/meonode/commit/5d234acb9d15dc77de33eff8624d5eb9a2622e37) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Point the package metadata at the new monorepo. `repository`, `bugs` and `homepage` referenced the three separate repositories that have now been merged into [l7aromeo/meonode](https://github.com/l7aromeo/meonode), and each package gains a `repository.directory` so npm links to its own subtree. No functional change — npm reads these fields from the published tarball, so a release is the only way to correct them.
