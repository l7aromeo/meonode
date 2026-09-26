---
'@meonode/ui': patch
---

Render function components with `css` the same way on the server and the client outside the React Server Components layer.

A function component given `css` — one built with `createNode`, an Emotion
`styled` component, a MUI component — had its styles compiled on the server into
a class of their own, which the server then handed it as a plain `className`.
The client renders the same component through Emotion, so the two sides
disagreed: the server's class carried a different prefix, a component that
passes the `className` on to a styled element kept it beside its own class where
the client merged the two, and without Next's `StyleRegistry` the class's rule
was never written at all. Hydration reported that the attributes did not match.

Outside the React Server Components layer — a plain `renderToString` or
`renderToPipeableStream` app, or the server pass of a Next client component —
these components now render through Emotion on the server too, so both sides
produce the same classes, with or without an Emotion `CacheProvider`, and every
class has its rule in the page.
