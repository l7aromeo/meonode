---
'@meonode/ui': patch
---

`StyleRegistry` emits each Emotion rule once per page when Next's Cache Components are on, instead of twice (#35).

With Cache Components, Next renders the client tree twice under one prerender,
and each pass's registry flushed the whole page's rules. The flushed set is now
shared by both passes of one render and kept apart between concurrent requests,
and every rule the page needs is still emitted.
