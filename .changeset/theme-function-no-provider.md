---
'@meonode/ui': patch
---

Stop printing a theme function's source into the stylesheet when no
`ThemeProvider` is present.

A theme function in a style, such as `color: theme => theme.system.primary`,
reached Emotion unresolved when no provider was above the node. Emotion
stringified it, so the function's source text shipped to every visitor in the
stylesheet and in the server-rendered HTML (`color:(t) =>t.system.primary;`).
The browser discarded the declaration, so nothing looked wrong.

With no provider, theme functions are now dropped wherever they sit — under a
property, inside an array, or as the whole `css` — including one that ignores
its argument. In development a warning names the property, once. Output with
a provider is unchanged.
