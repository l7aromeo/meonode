---
'@meonode/compiler': minor
---

An experimental `experimental_extractCss` option writes the styles of host factory call sites as CSS at build time, with class names on the call site and CSS variables for values only known at runtime. Whatever the compiler cannot prove stays on the runtime path. It needs a `@meonode/ui` that exports `registerStaticCss` and `toCssValue`. Off by default, and the output is then unchanged.
