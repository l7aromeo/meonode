---
'@meonode/ui': patch
---

A host element that has already been built, by `.render()` or by `createElement`, now keeps its attributes and its inline `style` when it is placed as a child of a node (Fixes #121), as React renders it and as a styled node already did. Before, its props were classified a second time on the way in, so an attribute whose name matches a CSS property (`width` and `height` on an `img` or an SVG `rect`, including ones shielded with `props`) and its `style` were turned into an Emotion class, in every child position, in the browser, in server rendering and in React Server Components; under `disableEmotion` they were dropped. A theme token in such a `style` still renders as its `var()`. Because the `style` is now inline, it wins over a class rule for the same property, as any inline style does: a rule an app wrote for that property, a `:hover` rule among them, no longer overrides it.
