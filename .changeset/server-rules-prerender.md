---
'@meonode/ui': patch
---

Emit the CSS rules of a server-compiled node in a prerendered page.

A node whose `css` is compiled on the server into a class name — a component
built with `createNode` and rendered from a server component — got its class but
not its rule when the page was statically prerendered, so it rendered unstyled.
The rule now travels with the element that uses it, as a
`<style href precedence="meonode">` React hoists into the document head, so it
reaches the page however it is rendered: prerendered, streamed, or cached.
