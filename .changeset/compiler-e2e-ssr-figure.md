---
'@meonode/compiler': patch
---

The README gives the end-to-end server-render figure again, re-measured against `@meonode/ui` 3.x: the compiled 156-node benchmark tree renders about 1.4x faster than the uncompiled one (27.8% less time per render), and 14.4% faster with its theme tokens taken out, where only prop partitioning applies. It says how the figure was measured.
