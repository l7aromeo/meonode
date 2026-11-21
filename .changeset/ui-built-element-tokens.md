---
'@meonode/ui': patch
---

A built element passed to a node keeps its key and, on a plain tag, its attributes as written: `theme.*` text in a `title` or a key is no longer turned into a CSS variable. Tokens are still converted in a plain tag's inline `style` and in a component element's props, which may take style values under any name.
