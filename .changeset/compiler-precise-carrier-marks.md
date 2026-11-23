---
'@meonode/compiler': patch
---

With `experimental_extractCss`, a named node is marked as a carrier (`__meo$r`, or `r: 1` on a factory call's site) only where it may be first in its walk on one render and follow a rule on another, so fewer nodes render through `StyledRenderer`. A node whose walk always begins at it (what `.render()` is called on, a `Component`'s return, a memoized node) or always follows a rule (a helper's root under callers that all put one before it) is left unmarked. A factory call after an imported call that is a plain function is now marked: the function may return a component's element on some renders.
