---
'@meonode/mui': minor
---

Update the Material UI packages, and raise the React floor.

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
