---
'@meonode/ui': patch
---

A call site the compiler has not rewritten renders its `theme.*` tokens faster (Fixes #109). An inline call site passes new props on every render but the same string literals, so each string a token is rewritten from is now kept with its `var()` form, and is rewritten on its first two renders instead of on every one. On an 85-node tree with a token in every style value, a client render with 20 re-renders takes about 24% less time.

A string is kept only on its second sighting, so strings that are new on every render, such as tokens a template literal builds per row, never push out the ones a page writes each time. What is kept, and what has been seen once, is capped at 512 strings per kind of property; a cache that fills is emptied and fills again, so memory stays bounded on the client and across server requests. What renders is unchanged.

Strings in a `css` value that hold no block are no longer scanned for a token left in a prelude, since a prelude needs a block.
