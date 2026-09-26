---
'@meonode/ui': patch
---

Resolve `theme.*` strings inside arrays on the client the way the server does.

A theme token inside an array in `css` — a fallback list such as
`fontFamily: ['Arial', 'theme.font.body']`, a string `css`, or a string inside
an array `css` — was converted to its CSS variable on the server but reached the
client untouched when the node was rendered from inside a React component. The
client then emitted `font-family:theme.font.body` under a different class from
the server's. The client now converts these strings too, so both sides emit the
same class and declarations. Server output is unchanged.
