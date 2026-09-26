---
'@meonode/ui': patch
---

Emit server-compiled CSS rules outside Next.js.

A component built with `createNode` and rendered on the server by
`renderToString` or `renderToPipeableStream` got its class but its rule was
only ever handed to Next's style registry, so without Next the rule was never
written. It is now part of the rendered output.
