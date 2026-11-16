---
'@meonode/mui': minor
---

Wrap MUI X 9.18 and require `@mui/material` 9.5, make every `@mui` peer except `@mui/material` optional, and export `@meonode/mui/x-date-pickers-pro`.

- **Optional peers.** `@mui/lab`, `@mui/material-nextjs` and every `@mui/x-*` package are now optional peer dependencies. Before, npm 7+ and bun installed all of them into every project that installed `@meonode/mui`. A project using only `@mui/material` dropped from about 529 MB to about 75 MB of `node_modules`. Install the `@mui` package behind each path you import; a missing one fails at build or load time with an error naming it, such as `Cannot find package '@mui/x-data-grid'`.
- **MUI X 9.18.** The `@mui/x-*` peers move from 9.13 to `^9.18.0`, and `@mui/x-charts` from `9.13.0` to `9.18.0`, still exact. The data grid paths add `GridFilterFormColumnInput`, and `x-data-grid-premium` also adds `ComputedColumnsPanelTrigger`, `GridArrowBackIcon`, `GridColumnMenuComputedColumnItem`, `GridComputedColumnIcon` and `GridLockIcon`. No wrapper was removed.
- **`@mui/material` 9.5 or later.** The `@mui/material` peer moves from `^9.4.0` to `^9.5.0`. The wrappers' types now use material 9.5's slot-prop override types (such as `ChipRootSlotPropsOverrides`) and `UsePaginationItem`, which 9.4 does not export, so upgrade `@mui/material` along with `@meonode/mui`. `@mui/lab` stays at `^9.0.0-beta.9`.
- **`@meonode/mui/x-date-pickers-pro`.** The wrappers for `@mui/x-date-pickers-pro` were built and published, but no `exports` entry reached them, so importing the path failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`. It now resolves like the other paths.
- **Charts through CommonJS.** `@meonode/mui/x-charts` and `@meonode/mui/x-charts-pro` load through ES modules (`import`, or a bundler). Their CommonJS build cannot load on `@mui/x-charts` 9.18.0: `@mui/x-charts-vendor` 9.18.0 does not ship the `lib-vendor` files its CommonJS entries require, so `require()` fails with `Cannot find module './lib-vendor/d3-scale/index.js'` (reported upstream as [mui/mui-x#24217](https://github.com/mui/mui-x/issues/24217)). With the vendor package's files present, the same build loads.
