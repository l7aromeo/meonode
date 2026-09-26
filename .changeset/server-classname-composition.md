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

This holds across a `'use cache'` boundary too. A component inside the scope
compiles in the scope's own cache, so the class a caller outside it hands in is
looked up in a store of classes compiled for components, which keeps the most
recently used up to 10,000 classes and 4 MiB of style text. A class that has left
the store by the time the component compiles stays a separate class beside the
component's own; in development that is reported once per class.
