---
'@meonode/mui': patch
---

Every build of a commit now writes the same `dist/` (Fixes #103). The order of the re-exports in `dist/esm/main.js` and `dist/cjs/main.cjs` depended on which of two concurrent module resolutions rollup finished first, so the release build and a local build of the same commit could differ. They now always list the components by name, sorted. The set of exports is unchanged, and nothing else in `dist/` changes.
