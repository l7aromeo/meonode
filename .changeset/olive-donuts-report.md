---
'@meonode/ui': patch
---

Publish the prerelease line from CI, and preflight releases properly.

CI ran only on `main`, and the Release workflow only fired on a successful CI
run for `main`, so the `beta` line had no sanctioned publish path at all —
leaving a laptop as the only option. `@meonode/ui` and `@meonode/compiler` set
`publishConfig.provenance`, which npm can only satisfy from a provider it
recognises, so a local `changeset publish` shipped `@meonode/mui` (no
provenance) and then failed on the other two. That left a released package
whose peer dependency did not exist on the registry.

Both workflows now trigger on `beta` as well, so the prerelease line publishes
the same way `main` does, with attestations intact. The trigger has to be
listed on the default branch to take effect at all — GitHub reads a
`workflow_run` workflow from there, so editing it on `beta` alone changes
nothing.

Added `bun run release:dry`, run in the release job before anything is
published. `npm publish --dry-run` alone would not have caught this: it packs
the tarball and reports success without ever evaluating
`publishConfig.provenance`. The preflight checks what actually decides the
outcome — that every package asking for provenance is somewhere it can be
minted (on GitHub Actions, that means `id-token: write`, not merely "in CI"),
and that no version is already on the registry — then defers to
`npm publish --dry-run` for packing, `files` and auth.
