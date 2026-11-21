---
'@meonode/ui': patch
---

A sole `0` or `''` child renders as React renders it, in a node (#144) and in a built element passed to a node (#139): `Span(0)` gives `<span>0</span>`, and a component receives `''` as its `children`. Both were dropped before. As in React, `children: count && X` now renders `0` when `count` is 0; write `count > 0 && X` to render nothing.
