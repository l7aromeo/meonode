---
'@meonode/ui': patch
---

A `className` passed into a styled server component now overrides its own `css`, the same as on the client.

On the client, Emotion composes an element's `className` with its `css`: a class
it generated is replaced by that class's styles, placed after `css` so they win,
and the element carries one class. In a React Server Component the element kept
both classes instead, and which one won depended on the order their rules
reached the page. It now composes the same way, into one class with the incoming
styles winning. Classes meonode did not generate, such as utility classes, are
kept as they are.

The styles compose when both were compiled in the same request. A component
inside a `'use cache'` scope compiles in that scope's own cache, so a `className`
from a caller outside the scope stays a separate class, and the component's own
`css` wins a conflict.
