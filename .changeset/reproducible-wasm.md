---
'@meonode/compiler': patch
---

The plugin's wasm now builds to the same bytes from the same commit on any machine, so a release can be checked by rebuilding its commit and comparing the file's sha256 with the published one. The build pins an exact Rust version and keeps machine-specific paths, such as the cargo home a dependency was unpacked into, out of the binary. What the plugin does is unchanged.
