---
'@meonode/ui': patch
---

A built element passed to a node keeps its children in its own shape, so React's missing-key warning fires for an unkeyed list inside it, as when React renders the element itself, with the same text and once per parent. A one-item list stays a list instead of becoming a single child, so React checks its key too.
