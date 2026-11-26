---
'@meonode/ui': patch
---

The `sideEffects` list added with the lazy diagnostics also lets bundlers leave out what an app does not use: an app that uses neither CSS extraction, a theme or portal provider, nor a portal host no longer ships their modules, and the server-layer guard still refuses the default entry in the React Server Components layer (Fixes [#173](https://github.com/l7aromeo/meonode/issues/173)). For an app that renders only `Row` and `Div`, without the compiler, the first load against 3.4.0 goes from 92,852 to 79,293 bytes minified (30,666 to 26,184 gzipped) under webpack 5, and from 684,098 to 662,719 bytes (212,769 to 206,141 gzipped) of client JavaScript, Next.js's own included, under Next.js 16 with Turbopack. Both figures include the diagnostics leaving the first load.
