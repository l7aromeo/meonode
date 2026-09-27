---
'@meonode/ui': patch
---

Server memory no longer grows with every distinct dynamic style a process renders.

On the server, Emotion keeps each rule it compiles in a memo that lasts as long
as the process, shared by every cache built on its default plugins. A long-running
server rendering styles that vary per request, such as colours or sizes computed
from data, grew by roughly 330 to 860 MiB per million distinct styles and never
gave the memory back. The caches meonode creates on the server now keep that memo
with the render that uses it: the React Server Components request cache, the
`StyleRegistry` cache, and the cache a styled element outside any `CacheProvider`
gets, where a bounded memo shared across renders keeps repeated styles fast. The
rules, class names and markup are byte for byte what they were.

`ThemedRule` rules now carry the same vendor prefixes as the rest of the page.
