---
"@meonode/compiler": patch
---

With `experimental_extractCss`, an imported factory called as a child of a children-first call is now joined at run time whatever the parent's own style, as the README describes. `Button([Slot({ color: 'red' })], { css: { ...base } })`, a `css` built by a call, a CSS prop read at run time, a sole child, and a parent whose props hold `theme`, `as`, a spread or a computed key all left `Slot(...)` as written, on the runtime path. A child whose own style is not made of literals is still left as written, and the output with the option off is unchanged (Fixes [#172](https://github.com/l7aromeo/meonode/issues/172)).
