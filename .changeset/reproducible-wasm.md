---
'@meonode/compiler': patch
---

The plugin's wasm now builds to the same bytes from the same commit on any machine of the same OS and CPU type, so a release can be checked by rebuilding its commit and comparing the file's sha256 with the published one. Releases build on Linux x86_64; `bun run build:wasm:linux-x64` in `packages/compiler` reproduces one from any machine with Docker. The build pins an exact Rust version and keeps machine-specific paths, such as the cargo home a dependency was unpacked into, out of the binary. What the plugin does is unchanged.
