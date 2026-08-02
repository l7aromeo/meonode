# meonode

Monorepo for the MeoNode packages.

| Package | Path | Description |
| --- | --- | --- |
| [`@meonode/ui`](https://www.npmjs.com/package/@meonode/ui) | `packages/ui` | JSX-free React component composition with CSS-first props and a theme engine. |
| [`@meonode/compiler`](https://www.npmjs.com/package/@meonode/compiler) | `packages/compiler/npm` | SWC WASM plugin that pre-partitions `@meonode/ui` call sites at build time. |
| [`@meonode/mui`](https://www.npmjs.com/package/@meonode/mui) | `packages/mui` | `@mui/material` wrappers for the BaseNode runtime. |

Documentation lives at [ui.meonode.com](https://ui.meonode.com).

## Layout

`packages/compiler` is the Rust workspace and its tooling — it is private and
never published. The published `@meonode/compiler` is `packages/compiler/npm`,
which carries only the built `.wasm` and a README, so the two are separate
workspace members.

Two fixture apps sit deliberately *outside* the workspace and install their own
dependencies: `packages/ui/tests/rsc-fixtures/next-app` and
`packages/compiler/e2e/{next-app,vite-app}`. They pin their own React and Next
versions on purpose, which is the point of them.

## Getting started

```bash
bun install
bun run build          # compiler wasm, then ui, then mui
```

Order matters: ui's compiled test mode loads the plugin that `build:compiler`
produces.

## Verifying

```bash
bun run lint
bun run test:ui        # unit suite, plain and through the real plugin
bun run test:compiler  # cargo tests plus the wasm ABI smoke test
bun run check:drift    # generated Rust tables still match ui's CSS property set
bun run test:rsc       # Next RSC suite, plain and compiled
bun run test:e2e       # Next + Vite plugin-on/off parity
```

`test:rsc` needs the fixture installed first:

```bash
bun run --filter @meonode/ui prepare:rsc-fixture
```

That step also copies the freshly built `.wasm` over the fixture's registry
copy, so the compiled RSC run exercises the plugin from this checkout rather
than the last published one.

## Releasing

Changesets. Describe the change and the bump it wants:

```bash
bun run changeset
```

Commit the generated `.changeset/*.md` alongside the code. CI requires one on
any pull request touching a published package — use `bunx changeset add --empty`
for changes that ship nothing.

Merging to `main` opens a "Version Packages" pull request with the bumps and
changelog entries. Merging *that* publishes to npm via trusted publishing and
tags each released package as `@meonode/<pkg>@<version>`.

For a prerelease line:

```bash
bunx changeset pre enter beta
# ... land changes as usual ...
bunx changeset pre exit
```

## Dependencies between the packages

`ui`, `mui` and `compiler` reference each other with `workspace:*`, so every
suite runs against the code in the same commit. mui's `peerDependencies` entry
for `@meonode/ui` stays a published range and is rewritten automatically when a
ui release leaves it.
