---
'@meonode/ui': patch
---

Emit the CSS rule of a `createNode(next/link)` node rendered from a server component.

The link got its generated class but no rule defining it, so it rendered with the
browser's default link styles. It now gets its rule like an intrinsic node does.
