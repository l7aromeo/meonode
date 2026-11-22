---
'@meonode/compiler': minor
---

An experimental `experimental_extractCss` option names the styles of host and layout factory call sites at build time. For a call site whose whole style is known when the module is built, the compiler writes the serialized styles and class name the runtime would compute for it, and the runtime inserts them through Emotion under that name, so the node renders with the class and rule it would have uncompiled. A node with any value only known at runtime stays on the runtime path. It needs a `@meonode/ui` that reads `__meo$n` and `__meo$i` and exports `registerStaticCss`. Off by default, and the output is then unchanged.
