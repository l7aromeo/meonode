# @meonode/mui

## 3.1.2

### Patch Changes

- [#105](https://github.com/l7aromeo/meonode/pull/105) [`3a37e7f`](https://github.com/l7aromeo/meonode/commit/3a37e7fe59b2b649e2c901300b465e11d087f630) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Every build of a commit now writes the same `dist/` (Fixes [#103](https://github.com/l7aromeo/meonode/issues/103)). The order of the re-exports in `dist/esm/main.js` and `dist/cjs/main.cjs` depended on which of two concurrent module resolutions rollup finished first, so the release build and a local build of the same commit could differ. They now always list the components by name, sorted. The set of exports is unchanged, and nothing else in `dist/` changes.

## 3.1.1

### Patch Changes

- [#85](https://github.com/l7aromeo/meonode/pull/85) [`f91d289`](https://github.com/l7aromeo/meonode/commit/f91d2890b928065c4ee58b16cebf2a69a8f64300) Thanks [@l7aromeo](https://github.com/l7aromeo)! - The packages now resolve their types under every TypeScript `moduleResolution`, from ESM and from CommonJS (Fixes [#81](https://github.com/l7aromeo/meonode/issues/81)). The top-level `main` and `types` of `@meonode/ui` named `dist/main.js` and `dist/main.d.ts`, which the package never shipped, and `@meonode/mui` had neither, so a consumer on `moduleResolution: "node"` got `TS2307: Cannot find module '@meonode/ui'`. They now name the shipped CommonJS entry and its declarations, with `module` naming the ESM entry and `typesVersions` mapping each subpath (`@meonode/ui/client`, `@meonode/mui/lab`, …) for that resolution mode.
  
  In `exports`, each condition now names its own declarations first: `import` the ESM `.d.ts`, `require` a CommonJS `.d.cts` written beside it. Before, `types` came after `import` and `require` and was never reached; a CommonJS file under `node16` or `nodenext` resolution was typed against ESM declarations and got `TS1479` on import. Under `node16` and `nodenext`, `import("../main")` references inside the declarations also failed to resolve, so the props and return types of `Div` and the other element factories were `any` there; they now carry the `.js` extension that resolution needs.
  
  The declarations no longer default-import React, which a consumer on `module: "commonjs"` without `esModuleInterop` read as `any`, losing every prop type built on it.

## 3.1.0

### Minor Changes

- [#66](https://github.com/l7aromeo/meonode/pull/66) [`c8db767`](https://github.com/l7aromeo/meonode/commit/c8db7670599f20fee7bfc315d4f4d18e9e619af9) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Wrap MUI X 9.18 and require `@mui/material` 9.5, make every `@mui` peer except `@mui/material` optional, and export `@meonode/mui/x-date-pickers-pro`.
  
  - **Optional peers.** `@mui/lab`, `@mui/material-nextjs` and every `@mui/x-*` package are now optional peer dependencies. Before, npm 7+ and bun installed all of them into every project that installed `@meonode/mui`. A project using only `@mui/material` dropped from about 529 MB to about 75 MB of `node_modules`. Install the `@mui` package behind each path you import; a missing one fails at build or load time with an error naming it, such as `Cannot find package '@mui/x-data-grid'`.
  - **MUI X 9.18.** The `@mui/x-*` peers move from 9.13 to `^9.18.0`, and `@mui/x-charts` from `9.13.0` to `9.18.0`, still exact. The data grid paths add `GridFilterFormColumnInput`, and `x-data-grid-premium` also adds `ComputedColumnsPanelTrigger`, `GridArrowBackIcon`, `GridColumnMenuComputedColumnItem`, `GridComputedColumnIcon` and `GridLockIcon`. No wrapper was removed.
  - **`@mui/material` 9.5 or later.** The `@mui/material` peer moves from `^9.4.0` to `^9.5.0`. The wrappers' types now use material 9.5's slot-prop override types (such as `ChipRootSlotPropsOverrides`) and `UsePaginationItem`, which 9.4 does not export, so upgrade `@mui/material` along with `@meonode/mui`. `@mui/lab` stays at `^9.0.0-beta.9`.
  - **`@meonode/mui/x-date-pickers-pro`.** The wrappers for `@mui/x-date-pickers-pro` were built and published, but no `exports` entry reached them, so importing the path failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`. It now resolves like the other paths.
  - **Charts through CommonJS.** `@meonode/mui/x-charts` and `@meonode/mui/x-charts-pro` load through ES modules (`import`, or a bundler). Their CommonJS build cannot load on `@mui/x-charts` 9.18.0: `@mui/x-charts-vendor` 9.18.0 does not ship the `lib-vendor` files its CommonJS entries require, so `require()` fails with `Cannot find module './lib-vendor/d3-scale/index.js'` (reported upstream as [mui/mui-x#24217](https://github.com/mui/mui-x/issues/24217)). With the vendor package's files present, the same build loads.

## 3.0.0

### Patch Changes

- Updated dependencies [[`ddd859e`](https://github.com/l7aromeo/meonode/commit/ddd859eb50d0a5066cf3b582db8936edeb603c1f)]:
  - @meonode/ui@3.0.0

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
