---
'@meonode/ui': minor
---

Editors now offer completions for CSS values in `css` objects and for length style props. A value in `css: { display: '…' }`, `css: { position: '…' }` or `css: { padding: '…' }`, and a direct prop such as `padding` or `width`, offered no completions; now each offers its property's keywords (`flex`, `absolute`, `auto`, `inherit`, …) and, with `MeoTheme` declared, the theme's tokens, under `as` and through `@meonode/mui` wrappers too. Every value that type-checked before still does, including a plain `string` such as a literal inferred through a node's props.

The value types now come from `csstype` with lengths typed `(string & {}) | number`, so `csstype` is a direct dependency, in the range `@types/react` already uses.

Fixes #79.
