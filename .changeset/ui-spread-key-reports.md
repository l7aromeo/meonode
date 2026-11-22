---
'@meonode/ui': patch
---

Two development diagnostics about a list spread in beside written-out children (`[a, ...rest, b]`) are corrected (Fixes #155). Without the compiler, a list is reported as generated without keys only when both its length and the number of its members without a key change between calls, so a keyed `rest` beside unkeyed written-out siblings is no longer reported. With the compiler, the note logged beside React's missing-key warning for such a list is logged once per call site, as React logs its own warning, instead of on every render.
