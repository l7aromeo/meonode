---
'@meonode/compiler': patch
---

Replace a runtime-support check the reader cannot run.

The compatibility section told readers to detect `__meo$list` support by
inspecting `COMPILER_SCHEMA_KEYS` for a `list` field. `@meonode/ui` does not
export that constant, or `COMPILED_MARKER`, or `SUPPORTED_COMPILER_SCHEMAS` —
the marker contract is internal — so the check could not be written, and a
reader who tried would find nothing to import.

It now points at the symptom instead, which needs no exports: a runtime that
does not know the key logs `Invalid attribute name: __meo$list` once per render
of every marked call site, and one that does know it reports React's own
missing-key warning for unkeyed generated lists. The two are mutually
exclusive, so the console says which side of the boundary you are on.

This README is copied into the published package by `build:wasm`, so the
unrunnable instruction would have shipped.
