---
'@meonode/ui': patch
---

Outside the React Server Components layer, function components with `css` render the same on the server as on the client.

A function component given `css` (one built with `createNode`, an Emotion
`styled` component, a MUI component) had its styles compiled on the server into
a class of its own, handed to it as a plain `className`, while the client renders
it through Emotion. The two disagreed: the server's class had a different prefix,
a component passing the `className` on to a styled element kept two classes where
the client merged them, and without Next's `StyleRegistry` the class's rule was
never written. Hydration reported that the attributes did not match.

In a plain `renderToString` or `renderToPipeableStream` app, and in the server
pass of a Next client component, these components now render through Emotion on
the server too, so both sides produce the same classes, with or without an
Emotion `CacheProvider`, and every class has its rule in the page.
