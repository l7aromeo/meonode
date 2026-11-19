---
'@meonode/ui': minor
---

`css` now takes a style object typed elsewhere. A value typed as React's `CSSProperties` or csstype's `Properties`, passed as it is (`css: style`) or assigned to `CssProp`, failed to type-check, because an interface has no index signature; now it is accepted with the same value types, at polymorphic call sites too. A number or an Emotion component selector is still rejected. An object typed by an interface with no style property, such as a `Date`, now also type-checks as `css` in a node call, as one typed by a type literal already did.

Emotion's own `CSSObject` is still not accepted as it is: its properties allow values the `css` prop does not, such as `padding: [1, 2]`. Pass it through Emotion's `css()`, as `css: css(emotionObject)`.

Fixes #84.
