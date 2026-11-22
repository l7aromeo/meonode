---
'@meonode/ui': patch
---

A call site compiled by `@meonode/compiler` now writes its style props in the same order as uncompiled (#150): string, number and boolean values first, then objects, arrays, `null` and theme functions. Compiled and uncompiled builds therefore give the node the same class and the same computed style. Before, a compiled call site kept source order, so in `Div({ margin: ['1px', '2px'], marginTop: 8 })` the compiled `margin-top` was `8px` where uncompiled it was `2px`. This affected every compiler release since 0.2.0 and is fixed in the runtime, so already-compiled code needs no rebuild.
