---
'@meonode/ui': patch
---

A client component with no `ThemeProvider` above it now hydrates without a className mismatch (Fixes #69). The server wrote a `theme.*` token in a style value as `var(--meonode-theme-*)` whether or not a provider was mounted, while the browser left it as written, so every element holding one got a different Emotion class on each side and React logged "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties". The browser now writes the same `var()` reference. A token in an at-rule or selector key still needs a provider, on both sides.

One visible change in a client-only app with no provider: a value token the page never defines used to be dropped as an invalid declaration, so an earlier rule for that property still applied. It is now written as `var()`, which resets the property, the same as the server and a provider have always done.
